/**
 * Encryption utility for sensitive data (passwords, tokens)
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get encryption key from environment or generate one
 * In production, ENCRYPTION_KEY should be a 32-byte hex string (64 characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // Fallback: generate a key from a default (NOT SECURE for production!)
    // This is only for development. Production MUST have ENCRYPTION_KEY set.
    const { logger } = require('./logger');
    logger.warn('ENCRYPTION_KEY not set in environment variables. Using insecure fallback.');
    return crypto.scryptSync('default-insecure-key-change-in-production', 'salt', KEY_LENGTH);
  }
  
  // If key is hex string, convert it
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // Otherwise, derive key from string
  return crypto.scryptSync(key, 'salt', KEY_LENGTH);
}

/**
 * Encrypt text using AES-256-GCM
 * Returns format: iv:tag:encrypted
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Return: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted data
 * Expects format: iv:tag:encrypted
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }
  
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format. Expected iv:tag:encrypted');
  }
  
  const [ivHex, tagHex, encrypted] = parts;
  
  if (!ivHex || !tagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

