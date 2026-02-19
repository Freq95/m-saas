/**
 * Encryption utility for sensitive data (passwords, tokens)
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_SALT = 'vecinu-saas-salt-v1';

/**
 * Get encryption key from environment.
 * ENCRYPTION_KEY should be a 32-byte hex string (64 characters) or passphrase.
 */
export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // If key is hex string, convert it
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, derive key from string
  return crypto.scryptSync(key, KEY_SALT, KEY_LENGTH);
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

  const tryDecrypt = (key: Buffer): string => {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  return tryDecrypt(getEncryptionKey());
}

