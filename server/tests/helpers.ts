import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { one, query } from '../src/db/pool.js';
import { hashPassword } from '../src/services/auth.js';

export const app: Express = createApp();

export type Session = { token: string; userId: string; cookie: string | undefined };

export async function loginAs(email: string, password: string): Promise<Session> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login fallido (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, cookie: setCookie?.[0] };
}

export async function loginAdmin(): Promise<Session> {
  return loginAs(env.SEED_ADMIN_EMAIL as string, env.SEED_ADMIN_PASSWORD as string);
}

export const TEST_PASSWORD = 'Prueba2026!';

/** Crea (o reutiliza) un usuario de prueba con un rol dado. */
export async function ensureUser(
  email: string,
  roleCode: string,
  options: { allowedModules?: string[] | null; fullName?: string } = {},
): Promise<string> {
  const existing = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing) {
    await query(
      `UPDATE users SET role_code = $2, allowed_modules = $3, is_active = true,
              failed_attempts = 0, locked_until = NULL, password_hash = $4
        WHERE id = $1`,
      [existing.id, roleCode, options.allowedModules ?? null, await hashPassword(TEST_PASSWORD)],
    );
    return existing.id;
  }
  const created = await one<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role_code, allowed_modules)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [
      email,
      await hashPassword(TEST_PASSWORD),
      options.fullName ?? email.split('@')[0],
      roleCode,
      options.allowedModules ?? null,
    ],
  );
  return created?.id as string;
}

/**
 * Inserta un documento directamente en la base (sin S3), útil para probar
 * búsqueda, préstamos y expedientes sin almacenamiento configurado.
 */
export async function insertDocument(input: {
  title: string;
  type?: string;
  module_code?: string;
  authorId?: string | null;
  extracted_text?: string | null;
  summary?: string | null;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO documents
       (title, type, module_code, s3_key, s3_bucket, file_name, file_type, file_size,
        sha256, author_id, extracted_text, summary, ai_status)
     VALUES ($1,$2,$3,$4,'bucket-pruebas',$5,'text/plain',128,'sha-pruebas',$6,$7,$8,'SKIPPED')
     RETURNING id`,
    [
      input.title,
      input.type ?? 'Acta de Grado',
      input.module_code ?? 'ACADEMIC',
      `pruebas/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
      `${input.title}.txt`,
      input.authorId ?? null,
      input.extracted_text ?? null,
      input.summary ?? null,
    ],
  );
  return row?.id as string;
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function cleanupDocuments(): Promise<void> {
  await query('DELETE FROM documents');
}
