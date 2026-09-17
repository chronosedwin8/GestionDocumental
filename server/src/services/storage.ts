import crypto from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from '../lib/errors.js';
import { getAwsConfig, type AwsConfig } from './system.js';
import { listModules } from './catalogs.js';

export type StorageContext = { client: S3Client; config: AwsConfig };

let cached: { key: string; ctx: StorageContext } | null = null;

export async function isStorageConfigured(): Promise<boolean> {
  return (await getAwsConfig()) !== null;
}

/** Devuelve el cliente S3 o lanza 503 STORAGE_NOT_CONFIGURED. Sin simulaciones. */
export async function getStorage(): Promise<StorageContext> {
  const config = await getAwsConfig();
  if (!config) throw ApiError.storageNotConfigured();

  const cacheKey = `${config.region}|${config.bucket}|${config.access_key_id}`;
  if (cached && cached.key === cacheKey) return cached.ctx;

  const client = new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.access_key_id, secretAccessKey: config.secret_access_key },
  });
  const ctx = { client, config };
  cached = { key: cacheKey, ctx };
  return ctx;
}

export function resetStorageCache(): void {
  cached = null;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '');
  return (cleaned || 'archivo').slice(0, 120);
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'documento'
  );
}

function withBase(base: string, rest: string): string {
  return base ? `${base.replace(/\/+$/, '')}/${rest}` : rest;
}

/** `{base}/{modules.s3_folder}/{año}/{tipo-slug}/{uuid}-{nombre-sanitizado}` */
export function buildDocumentKey(params: {
  baseFolder: string;
  moduleFolder: string;
  year: number;
  documentType: string;
  fileName: string;
}): string {
  const file = `${crypto.randomUUID()}-${sanitizeFileName(params.fileName)}`;
  return withBase(
    params.baseFolder,
    `${params.moduleFolder}/${params.year}/${slugify(params.documentType)}/${file}`,
  );
}

/** Clave de archivo histórico de una versión: `…/versions/{n}/{archivo}` */
export function buildVersionKey(currentKey: string, versionNumber: number): string {
  const idx = currentKey.lastIndexOf('/');
  const dir = idx >= 0 ? currentKey.slice(0, idx) : '';
  const file = idx >= 0 ? currentKey.slice(idx + 1) : currentKey;
  return `${dir}/versions/${versionNumber}/${file}`;
}

export async function buildActaKey(documentId: string): Promise<string> {
  const { config } = await getStorage();
  const date = new Date().toISOString().slice(0, 10);
  return withBase(config.base_folder, `actas/eliminacion/${date}-${documentId}.pdf`);
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string> = {},
): Promise<{ bucket: string; key: string }> {
  const { client, config } = await getStorage();
  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      Metadata: metadata,
    },
  });
  await upload.done();
  return { bucket: config.bucket, key };
}

export async function copyObject(sourceKey: string, targetKey: string): Promise<void> {
  const { client, config } = await getStorage();
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: `${config.bucket}/${encodeURI(sourceKey)}`,
      Key: targetKey,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, config } = await getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function presignDownload(
  key: string,
  fileName: string,
  disposition: 'inline' | 'attachment' = 'inline',
  expiresInSeconds = 900,
): Promise<{ url: string; expires_at: string }> {
  const { client, config } = await getStorage();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentDisposition: `${disposition}; filename="${sanitizeFileName(fileName)}"`,
  });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { url, expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  details: { bucket: string; base_folder: string; folder_exists: boolean };
}> {
  const { client, config } = await getStorage();
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.base_folder ? `${config.base_folder}/` : undefined,
      MaxKeys: 1,
    }),
  );
  const folderExists = (listed.KeyCount ?? 0) > 0;
  return {
    success: true,
    message: folderExists
      ? 'Conexión correcta. La carpeta base existe.'
      : 'Conexión correcta. La carpeta base aún no tiene objetos.',
    details: { bucket: config.bucket, base_folder: config.base_folder, folder_exists: folderExists },
  };
}

/** Crea el marcador `.keep` de cada carpeta de módulo y de actas. */
export async function initFolders(): Promise<string[]> {
  const { client, config } = await getStorage();
  const modules = await listModules(false);
  const folders = [...modules.map((m) => m.s3_folder), 'actas/eliminacion'];
  const created: string[] = [];
  for (const folder of folders) {
    const key = withBase(config.base_folder, `${folder}/.keep`);
    await client.send(
      new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: '', ContentType: 'text/plain' }),
    );
    created.push(key);
  }
  return created;
}

export async function totalStorageBytes(): Promise<number | null> {
  const config = await getAwsConfig();
  if (!config) return null;
  const { client } = await getStorage();
  let total = 0;
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.base_folder ? `${config.base_folder}/` : undefined,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) total += obj.Size ?? 0;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return total;
}
