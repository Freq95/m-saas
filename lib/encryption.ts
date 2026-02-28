/**
 * Encryption utility for sensitive data (passwords, tokens)
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const DEFAULT_KEY_VERSION = 'v1';

function getKeyEnvName(version: string): string {
  return `ENCRYPTION_KEY_${version.toUpperCase()}`;
}

function getKeyHexForVersion(version: string): string {
  const versionedEnv = process.env[getKeyEnvName(version)];
  if (versionedEnv) {
    return versionedEnv;
  }
  if (version === DEFAULT_KEY_VERSION && process.env.ENCRYPTION_KEY) {
    return process.env.ENCRYPTION_KEY;
  }
  throw new Error(
    `Missing encryption key for version "${version}". Expected ${getKeyEnvName(version)}`
  );
}

/**
 * Get encryption key from environment.
 * Keys must be 32-byte hex strings (64 characters).
 * Supports ENCRYPTION_KEY (legacy v1 default) and ENCRYPTION_KEY_<VERSION>.
 */
export function getEncryptionKey(version: string = DEFAULT_KEY_VERSION): Buffer {
  const keyHex = getKeyHexForVersion(version);
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error(
      `Encryption key ${version} must be a 64-character hex string (32 bytes). ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt text using AES-256-GCM
 * Returns format: version:iv:tag:encrypted
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }
  
  const key = getEncryptionKey(DEFAULT_KEY_VERSION);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Return: version:iv:tag:encrypted
  return `${DEFAULT_KEY_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted data
 * Expects format: version:iv:tag:encrypted
 * Also supports legacy format: iv:tag:encrypted (treated as v1).
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }
  
  const parts = encryptedData.split(':');
  let version: string;
  let ivHex: string;
  let tagHex: string;
  let encrypted: string;

  if (parts.length === 4) {
    [version, ivHex, tagHex, encrypted] = parts;
  } else if (parts.length === 3) {
    // Backward compatibility for data stored before key versioning.
    version = DEFAULT_KEY_VERSION;
    [ivHex, tagHex, encrypted] = parts;
  } else {
    throw new Error('Invalid encrypted data format. Expected version:iv:tag:encrypted');
  }
  
  if (!version || !ivHex || !tagHex || !encrypted) {
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

  return tryDecrypt(getEncryptionKey(version));
}
