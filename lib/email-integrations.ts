/**
 * Email Integration Management
 * Handles storing and retrieving email integration credentials
 */

import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from './db/mongo-utils';
import { encrypt, decrypt } from './encryption';
import { logger } from './logger';
import { ObjectId } from 'mongodb';

export interface EmailIntegration {
  id: number;
  user_id: number;
  tenant_id: ObjectId;
  provider: 'yahoo' | 'gmail' | 'outlook';
  email: string;
  encrypted_password?: string;
  encrypted_refresh_token?: string;
  encrypted_access_token?: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_synced_uid?: number | null;
  token_expires_at?: number | null;
  // Health tracking — written by the sync runners. Lets the UI distinguish a
  // genuinely working integration from one that's enabled but silently broken
  // (e.g. an OAuth refresh token that returns invalid_grant).
  last_sync_status?: 'success' | 'failed' | null;
  last_sync_attempted_at?: string | null;
  last_sync_error_code?: SyncErrorCode | null;
  last_sync_error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export type SyncErrorCode = 'AUTH_REVOKED' | 'NETWORK' | 'UNKNOWN';

/** Classify a raw error from a sync runner into a stable, UI-friendly code. */
export function classifySyncError(err: unknown): SyncErrorCode {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();
  if (
    lower.includes('invalid_grant') ||
    lower.includes('invalid grant') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('missing refresh token') ||
    lower.includes('failed to refresh access token')
  ) {
    return 'AUTH_REVOKED';
  }
  if (
    lower.includes('econn') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('socket')
  ) {
    return 'NETWORK';
  }
  return 'UNKNOWN';
}

/**
 * Record the outcome of a sync attempt against an integration. Safe to call from
 * inside or outside the runner; failures here are swallowed to avoid masking
 * the underlying sync error.
 */
export async function recordIntegrationSyncResult(
  integrationId: number,
  outcome:
    | { status: 'success' }
    | { status: 'failed'; error: unknown }
): Promise<void> {
  try {
    const db = await getMongoDbOrThrow();
    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      last_sync_status: outcome.status,
      last_sync_attempted_at: nowIso,
      updated_at: nowIso,
    };
    if (outcome.status === 'success') {
      update.last_sync_error_code = null;
      update.last_sync_error_message = null;
    } else {
      update.last_sync_error_code = classifySyncError(outcome.error);
      const message = outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error ?? 'Unknown sync error');
      update.last_sync_error_message = message.slice(0, 500);
    }
    await db.collection('email_integrations').updateOne({ id: integrationId }, { $set: update });
  } catch (writeErr) {
    logger.warn('Failed to record integration sync result', {
      integrationId,
      writeErr: writeErr instanceof Error ? writeErr.message : String(writeErr),
    });
  }
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
  tenantId: ObjectId | undefined,
  provider: 'yahoo' | 'gmail' | 'outlook'
): Promise<EmailIntegrationConfig | null> {
  const db = await getMongoDbOrThrow();

  try {
    const integration = await db
      .collection('email_integrations')
      .find(tenantId
        ? { user_id: userId, tenant_id: tenantId, provider, is_active: true }
        : { user_id: userId, provider, is_active: true })
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
  tenantId: ObjectId | undefined,
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
        email,
        is_active: true,
        updated_at: now,
      };

      if (encryptedPassword !== null) setValues.encrypted_password = encryptedPassword;
      if (encryptedRefreshToken !== null) setValues.encrypted_refresh_token = encryptedRefreshToken;
      if (encryptedAccessToken !== null) setValues.encrypted_access_token = encryptedAccessToken;

      await db.collection('email_integrations').updateOne(
        { id: existing.id, user_id: userId, provider },
        { $set: setValues }
      );

      const updated = await db.collection('email_integrations').findOne({ id: existing.id, user_id: userId, provider });
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
      ...(tenantId ? { tenant_id: tenantId } : {}),
      provider,
      email,
      encrypted_password: encryptedPassword,
      encrypted_refresh_token: encryptedRefreshToken,
      encrypted_access_token: encryptedAccessToken,
      is_active: true,
      last_sync_at: null,
      last_synced_uid: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection<FlexDoc>('email_integrations').insertOne(doc);
    return normalizeEmailIntegration(doc);
  } catch (error) {
    logger.error('Error saving email integration', { error, userId, provider, email });
    throw error;
  }
}

/**
 * Get all integrations for a user
 */
export async function getUserEmailIntegrations(userId: number, tenantId?: ObjectId): Promise<EmailIntegration[]> {
  const db = await getMongoDbOrThrow();

  try {
    const rows = await db
      .collection('email_integrations')
      .find(tenantId ? { user_id: userId, tenant_id: tenantId } : { user_id: userId })
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
        last_synced_uid: integration.last_synced_uid ?? null,
        last_sync_status: integration.last_sync_status ?? null,
        last_sync_attempted_at: integration.last_sync_attempted_at ?? null,
        last_sync_error_code: integration.last_sync_error_code ?? null,
        last_sync_error_message: integration.last_sync_error_message ?? null,
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
export async function deleteEmailIntegration(integrationId: number, userId: number, tenantId?: ObjectId): Promise<boolean> {
  const db = await getMongoDbOrThrow();

  try {
    const result = await db.collection('email_integrations').deleteOne({
      id: integrationId,
      user_id: userId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error deleting email integration', { error, integrationId, userId });
    return false;
  }
}

/**
 * Get integration by ID
 */
export async function getEmailIntegrationById(integrationId: number, userId: number, tenantId?: ObjectId): Promise<EmailIntegration | null> {
  const db = await getMongoDbOrThrow();

  try {
    const row = await db.collection('email_integrations').findOne({
      id: integrationId,
      user_id: userId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
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
