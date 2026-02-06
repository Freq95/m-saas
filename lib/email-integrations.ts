/**
 * Email Integration Management
 * Handles storing and retrieving email integration credentials
 */

import { getDb } from './db';
import { encrypt, decrypt } from './encryption';
import { DEFAULT_USER_ID } from './constants';
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

/**
 * Get email integration config for a provider
 */
export async function getEmailIntegrationConfig(
  userId: number,
  provider: 'yahoo' | 'gmail' | 'outlook'
): Promise<EmailIntegrationConfig | null> {
  const db = getDb();
  
  try {
    const result = await db.query(`
      SELECT * FROM email_integrations 
      WHERE user_id = $1 AND provider = $2 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, provider]);
    
    if (!result || result.rows.length === 0) {
      return null;
    }
    
    const integration = result.rows[0] as EmailIntegration;
    
    const config: EmailIntegrationConfig = {
      email: integration.email,
    };
    
    if (integration.encrypted_password) {
      try {
        config.password = decrypt(integration.encrypted_password);
      } catch (error) {
        logger.error('Failed to decrypt password', { error, integrationId: integration.id });
        return null;
      }
    }
    
    if (integration.encrypted_refresh_token) {
      try {
        config.refreshToken = decrypt(integration.encrypted_refresh_token);
      } catch (error) {
        logger.error('Failed to decrypt refresh token', { error, integrationId: integration.id });
      }
    }
    
    if (integration.encrypted_access_token) {
      try {
        config.accessToken = decrypt(integration.encrypted_access_token);
      } catch (error) {
        logger.error('Failed to decrypt access token', { error, integrationId: integration.id });
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
  const db = getDb();
  
  try {
    logger.info('Saving email integration', { userId, provider, email });
    
    // Check if integration exists
    const existing = await db.query(`
      SELECT * FROM email_integrations 
      WHERE user_id = $1 AND provider = $2 AND email = $3
    `, [userId, provider, email]);
    
    logger.info('Existing integration check', { found: existing?.rows?.length || 0 });
    
    let encryptedPassword: string | null = null;
    let encryptedRefreshToken: string | null = null;
    let encryptedAccessToken: string | null = null;
    
    if (password) {
      try {
        encryptedPassword = encrypt(password);
        logger.info('Password encrypted successfully');
      } catch (err) {
        logger.error('Failed to encrypt password', { error: err });
        throw new Error('Failed to encrypt password');
      }
    }
    
    if (refreshToken) {
      encryptedRefreshToken = encrypt(refreshToken);
    }
    
    if (accessToken) {
      encryptedAccessToken = encrypt(accessToken);
    }
    
    if (existing && existing.rows.length > 0) {
      // Update existing
      logger.info('Updating existing integration', { id: existing.rows[0].id });
      const result = await db.query(`
        UPDATE email_integrations 
        SET encrypted_password = $1,
            encrypted_refresh_token = $2,
            encrypted_access_token = $3,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, [encryptedPassword, encryptedRefreshToken, encryptedAccessToken, existing.rows[0].id]);
      
      logger.info('Update result', { rows: result.rows.length, data: result.rows[0] });
      return result.rows[0] as EmailIntegration;
    } else {
      // Create new
      logger.info('Creating new integration');
      const result = await db.query(`
        INSERT INTO email_integrations 
        (user_id, provider, email, encrypted_password, encrypted_refresh_token, encrypted_access_token, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [userId, provider, email, encryptedPassword, encryptedRefreshToken, encryptedAccessToken]);
      
      logger.info('Insert result', { rows: result.rows.length, data: result.rows[0] });
      
      if (!result.rows || result.rows.length === 0) {
        logger.error('INSERT returned no rows');
        throw new Error('Failed to save integration - no data returned');
      }
      
      return result.rows[0] as EmailIntegration;
    }
  } catch (error) {
    logger.error('Error saving email integration', { error, userId, provider, email });
    throw error;
  }
}

/**
 * Get all integrations for a user
 */
export async function getUserEmailIntegrations(userId: number): Promise<EmailIntegration[]> {
  const db = getDb();
  
  try {
    const result = await db.query(`
      SELECT id, user_id, provider, email, is_active, last_sync_at, created_at, updated_at
      FROM email_integrations
      WHERE user_id = $1
      ORDER BY provider, created_at DESC
    `, [userId]);
    
    return (result?.rows || []) as EmailIntegration[];
  } catch (error) {
    logger.error('Error getting user email integrations', { error, userId });
    return [];
  }
}

/**
 * Delete email integration
 */
export async function deleteEmailIntegration(integrationId: number, userId: number): Promise<boolean> {
  const db = getDb();
  
  try {
    const result = await db.query(`
      DELETE FROM email_integrations 
      WHERE id = $1 AND user_id = $2
    `, [integrationId, userId]);
    
    return (result?.affectedRows || 0) > 0;
  } catch (error) {
    logger.error('Error deleting email integration', { error, integrationId, userId });
    return false;
  }
}

/**
 * Update integration sync time
 */
export async function updateIntegrationSyncTime(integrationId: number): Promise<void> {
  const db = getDb();
  
  try {
    await db.query(`
      UPDATE email_integrations 
      SET last_sync_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [integrationId]);
  } catch (error) {
    logger.error('Error updating integration sync time', { error, integrationId });
  }
}

/**
 * Get integration by ID
 */
export async function getEmailIntegrationById(integrationId: number, userId: number): Promise<EmailIntegration | null> {
  const db = getDb();
  
  try {
    const result = await db.query(`
      SELECT * FROM email_integrations
      WHERE id = $1 AND user_id = $2
    `, [integrationId, userId]);
    
    if (!result || result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as EmailIntegration;
  } catch (error) {
    logger.error('Error getting email integration by ID', { error, integrationId, userId });
    return null;
  }
}

