import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function getConfig() {
  return {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  };
}

function getClient(): S3Client {
  const { accountId, accessKeyId, secretAccessKey } = getConfig();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { bucket } = getConfig();
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return getPublicUrl(key);
}

export async function deleteFromR2(key: string): Promise<void> {
  const { bucket } = getConfig();
  const client = getClient();

  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}

export function getPublicUrl(key: string): string {
  const { accountId, bucket, publicUrl } = getConfig();

  if (publicUrl) {
    return `${publicUrl}/${key}`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

export function isR2Configured(): boolean {
  const { accountId, accessKeyId, secretAccessKey, bucket } = getConfig();
  return !!(accountId && accessKeyId && secretAccessKey && bucket);
}
