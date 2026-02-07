/**
 * Email Integration Management
 * Handles storing and retrieving email integration credentials
 */

import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache, stripMongoId } from './db/mongo-utils';
import { encrypt, decrypt } from './encryption';
import { logger } from './logger';

export interface EmailIntegration {
  id: number;
  user_id: number;
  provider: 'yahoo' | 'gmail' | 'outlook';
  email: string;
  encrypted_password?: string;
  encrypted_refresh_token?: string;
  encrypted_access_token?: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailIntegrationConfig {
  email: string;
  password?: string;
  refreshToken?: string;
  accessToken?: string;
}

function normalizeEmailIntegration(doc: any): EmailIntegration {
  return stripMongoId(doc) as EmailIntegration;
}

/**
 * Get email integration config for a provider
 */
export async function getEmailIntegrationConfig(
  userId: number,
  provider: 'yahoo' | 'gmail' | 'outlook'
): Promise<EmailIntegrationConfig | null> {
  const db = await getMongoDbOrThrow();

  try {
    const integration = await db
      .collection('email_integrations')
      .find({ user_id: userId, provider, is_active: true })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    if (!integration) {
      return null;
    }

    const normalized = normalizeEmailIntegration(integration);
    const config: EmailIntegrationConfig = {
      email: normalized.email,
    };

    if (normalized.encrypted_password) {
      try {
        config.password = decrypt(normalized.encrypted_password);
      } catch (error) {
        logger.error('Failed to decrypt password', { error, integrationId: normalized.id });
        return null;
      }
    }

    if (normalized.encrypted_refresh_token) {
      try {
        config.refreshToken = decrypt(normalized.encrypted_refresh_token);
      } catch (error) {
        logger.error('Failed to decrypt refresh token', { error, integrationId: normalized.id });
      }
    }

    if (normalized.encrypted_access_token) {
      try {
        config.accessToken = decrypt(normalized.encrypted_access_token);
      } catch (error) {
        logger.error('Failed to decrypt access token', { error, integrationId: normalized.id });
      }
    }

    return config;
  } catch (error) {
    logger.error('Error getting email integration config', { error, userId, provider });
    return null;
  }
}

/**
 * Create or update email integration
 */
export async function saveEmailIntegration(
  userId: number,
  provider: 'yahoo' | 'gmail' | 'outlook',
  email: string,
  password?: string,
  refreshToken?: string,
  accessToken?: string
): Promise<EmailIntegration> {
  const db = await getMongoDbOrThrow();

  try {
    logger.info('Saving email integration', { userId, provider, email });

    const existing = await db.collection('email_integrations').findOne({
      user_id: userId,
      provider,
      email,
    });

    let encryptedPassword: string | null = null;
    let encryptedRefreshToken: string | null = null;
    let encryptedAccessToken: string | null = null;

    if (password) {
      encryptedPassword = encrypt(password);
    }

    if (refreshToken) {
      encryptedRefreshToken = encrypt(refreshToken);
    }

    if (accessToken) {
      encryptedAccessToken = encrypt(accessToken);
    }

    const now = new Date().toISOString();

    if (existing) {
      const setValues: Record<string, unknown> = {
        is_active: true,
        updated_at: now,
      };

      if (encryptedPassword !== null) setValues.encrypted_password = encryptedPassword;
      if (encryptedRefreshToken !== null) setValues.encrypted_refresh_token = encryptedRefreshToken;
      if (encryptedAccessToken !== null) setValues.encrypted_access_token = encryptedAccessToken;

      await db.collection('email_integrations').updateOne(
        { id: existing.id },
        { $set: setValues }
      );

      const updated = await db.collection('email_integrations').findOne({ id: existing.id });
      invalidateMongoCache();
      if (!updated) {
        throw new Error('Failed to load updated integration');
      }
      return normalizeEmailIntegration(updated);
    }

    const integrationId = await getNextNumericId('email_integrations');
    const doc = {
      _id: integrationId,
      id: integrationId,
      user_id: userId,
      provider,
      email,
      encrypted_password: encryptedPassword,
      encrypted_refresh_token: encryptedRefreshToken,
      encrypted_access_token: encryptedAccessToken,
      is_active: true,
      last_sync_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('email_integrations').insertOne(doc);
    invalidateMongoCache();
    return normalizeEmailIntegration(doc);
  } catch (error) {
    logger.error('Error saving email integration', { error, userId, provider, email });
    throw error;
  }
}

/**
 * Get all integrations for a user
 */
export async function getUserEmailIntegrations(userId: number): Promise<EmailIntegration[]> {
  const db = await getMongoDbOrThrow();

  try {
    const rows = await db
      .collection('email_integrations')
      .find({ user_id: userId })
      .sort({ provider: 1, created_at: -1 })
      .toArray();

    return rows.map((row: any) => {
      const integration = normalizeEmailIntegration(row);
      return {
        id: integration.id,
        user_id: integration.user_id,
        provider: integration.provider,
        email: integration.email,
        is_active: integration.is_active,
        last_sync_at: integration.last_sync_at || null,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
      } as EmailIntegration;
    });
  } catch (error) {
    logger.error('Error getting user email integrations', { error, userId });
    return [];
  }
}

/**
 * Delete email integration
 */
export async function deleteEmailIntegration(integrationId: number, userId: number): Promise<boolean> {
  const db = await getMongoDbOrThrow();

  try {
    const result = await db.collection('email_integrations').deleteOne({
      id: integrationId,
      user_id: userId,
    });
    invalidateMongoCache();
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error deleting email integration', { error, integrationId, userId });
    return false;
  }
}

/**
 * Update integration sync time
 */
export async function updateIntegrationSyncTime(integrationId: number): Promise<void> {
  const db = await getMongoDbOrThrow();

  try {
    const now = new Date().toISOString();
    await db.collection('email_integrations').updateOne(
      { id: integrationId },
      { $set: { last_sync_at: now, updated_at: now } }
    );
    invalidateMongoCache();
  } catch (error) {
    logger.error('Error updating integration sync time', { error, integrationId });
  }
}

/**
 * Get integration by ID
 */
export async function getEmailIntegrationById(integrationId: number, userId: number): Promise<EmailIntegration | null> {
  const db = await getMongoDbOrThrow();

  try {
    const row = await db.collection('email_integrations').findOne({
      id: integrationId,
      user_id: userId,
    });

    if (!row) {
      return null;
    }

    return normalizeEmailIntegration(row);
  } catch (error) {
    logger.error('Error getting email integration by ID', { error, integrationId, userId });
    return null;
  }
}
