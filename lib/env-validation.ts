const ENV_VALIDATION_FLAG = '__m_saas_env_validated__';

type EnvValidationError = {
  key: string;
  message: string;
};

function getGlobalFlagContainer(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

export function validateServerEnv(): void {
  const globalFlags = getGlobalFlagContainer();
  if (globalFlags[ENV_VALIDATION_FLAG]) {
    return;
  }

  const errors: EnvValidationError[] = [];

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || !/^[0-9a-f]{64}$/i.test(encryptionKey)) {
    errors.push({
      key: 'ENCRYPTION_KEY',
      message: 'must be a 64-character hex string',
    });
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret.trim().length < 32) {
    errors.push({
      key: 'AUTH_SECRET',
      message: 'must be set and at least 32 characters',
    });
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || !/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
    errors.push({
      key: 'MONGODB_URI',
      message: 'must be a valid MongoDB connection URI',
    });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length < 32) {
    errors.push({
      key: 'CRON_SECRET',
      message: 'must be set and at least 32 characters',
    });
  }

  if (errors.length > 0) {
    const details = errors.map((entry) => `${entry.key} ${entry.message}`).join('; ');
    throw new Error(`Invalid server environment configuration: ${details}`);
  }

  globalFlags[ENV_VALIDATION_FLAG] = true;
}

