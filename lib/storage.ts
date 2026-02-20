import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(
    key: string,
    expiresInSeconds?: number,
    options?: { contentDisposition?: string; contentType?: string }
  ): Promise<string>;
  delete(key: string): Promise<void>;
}

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucketName: string;
};

let client: S3Client | null = null;
let provider: StorageProvider | null = null;

function getR2Config(): R2Config {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT_URL;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucketName) {
    throw new Error(
      'Cloud storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL, R2_BUCKET_NAME.'
    );
  }

  return { accessKeyId, secretAccessKey, endpoint, bucketName };
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_ENDPOINT_URL &&
      process.env.R2_BUCKET_NAME
  );
}

function getClient(): { s3: S3Client; bucketName: string } {
  const config = getR2Config();
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { s3: client, bucketName: config.bucketName };
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (!stream || typeof (stream as any)[Symbol.asyncIterator] !== 'function') {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

class R2StorageProvider implements StorageProvider {
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const { s3, bucketName } = getClient();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      })
    );
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const { s3, bucketName } = getClient();
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return streamToBuffer(result.Body);
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = 3600,
    options?: { contentDisposition?: string; contentType?: string }
  ): Promise<string> {
    const { s3, bucketName } = getClient();
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: options?.contentDisposition,
      ResponseContentType: options?.contentType,
    });
    return awsGetSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    const { s3, bucketName } = getClient();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
  }
}

export function getStorageProvider(): StorageProvider {
  if (!provider) {
    provider = new R2StorageProvider();
  }
  return provider;
}

export function buildClientStorageKey(
  tenantId: string,
  clientId: number,
  originalFilename: string
): string {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tenants/${tenantId}/clients/${clientId}/${Date.now()}_${safeName}`;
}
