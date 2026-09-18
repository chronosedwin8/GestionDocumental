import crypto from 'node:crypto';
import { sql, sqlOne } from './db.js';
import { QA } from './config.js';
import type { QaFile } from './files.js';

export type DocFixtureInput = {
  title: string;
  module: string;
  type: string;
  file: QaFile;
  authorId: string | null;
  status?: string;
  folio?: boolean;
  category?: string | null;
  personId?: string | null;
  extractedText?: string | null;
};

/**
 * Inserta un documento replicando exactamente lo que hace `createDocument`
 * (clave S3, sha256, permisos por defecto desde la matriz, folio y custodia).
 *
 * Es el ÚNICO atajo de la batería: sin S3 configurado `POST /documents`
 * responde 503 por diseño, así que los documentos de prueba se siembran por
 * SQL para poder ejercitar por HTTP todo lo demás (folio, aprobación,
 * transferencia, préstamos, papelera…).
 */
export async function seedDocument(input: DocFixtureInput): Promise<string> {
  const sha = crypto.createHash('sha256').update(input.file.buffer).digest('hex');
  const module = await sqlOne<{ s3_folder: string }>('SELECT s3_folder FROM modules WHERE code = $1', [input.module]);
  const key = `qa/${module?.s3_folder ?? 'x'}/${new Date().getFullYear()}/${crypto.randomUUID()}-${input.file.name}`;

  const row = await sqlOne<{ id: string }>(
    `INSERT INTO documents
       (title, type, module_code, s3_key, s3_bucket, file_name, file_type, file_size,
        sha256, page_count, author_id, extracted_text, ai_status, category, person_id, status_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SKIPPED',$13,$14,$15)
     RETURNING id`,
    [
      input.title,
      input.type,
      input.module,
      key,
      'qa-bucket-inexistente',
      input.file.name,
      input.file.mime,
      input.file.buffer.length,
      sha,
      1,
      input.authorId,
      input.extractedText ?? `Contenido QA del documento ${input.title}.`,
      input.category ?? null,
      input.personId ?? null,
      input.status ?? 'ARCHIVO_GESTION',
    ],
  );
  const id = row!.id;

  await sql(
    `INSERT INTO document_permissions (document_id, role_code, can_read, can_write, can_delete)
     SELECT $1, rma.role_code, rma.can_read, rma.can_write, r.has_full_access
       FROM role_module_access rma JOIN roles r ON r.code = rma.role_code
      WHERE rma.module_code = $2 AND rma.can_read = true
     ON CONFLICT DO NOTHING`,
    [id, input.module],
  );

  if (input.folio !== false) await sql('SELECT assign_folio($1, NULL)', [id]);

  await sql(
    `SELECT log_custody_event($1,$2,$3,$4,'CREATED',$5,NULL,NULL,'{"origen":"fixture-qa"}'::jsonb)`,
    [id, input.title, input.module, key, input.authorId],
  );

  return id;
}

/** Borra todo lo creado por la batería (prefijo QA1_). Idempotente. */
export async function cleanupAll(): Promise<void> {
  const like = `${QA.prefix}%`;
  await sql('DELETE FROM documents WHERE title LIKE $1', [like]);
  // Incluye los expedientes que el servidor abre solo al crear una persona
  // ("Historia laboral — QA1_…", "Expediente académico — QA1_…").
  await sql('DELETE FROM expedientes WHERE titulo LIKE $1 OR titulo LIKE $2', [like, `%${QA.prefix}%`]);
  await sql(
    'DELETE FROM expedientes WHERE person_id IN (SELECT id FROM people WHERE first_name LIKE $1 OR document_number LIKE $1)',
    [like],
  );
  await sql('DELETE FROM person_events WHERE person_id IN (SELECT id FROM people WHERE first_name LIKE $1 OR document_number LIKE $1)', [like]);
  await sql('DELETE FROM people WHERE first_name LIKE $1 OR document_number LIKE $1', [like]);
  await sql('DELETE FROM retention_rules WHERE document_type LIKE $1', [like]);
  await sql('DELETE FROM document_categories WHERE name LIKE $1', [like]);
  await sql('DELETE FROM help_articles WHERE slug LIKE $1', ['qa-%']);
  await sql('DELETE FROM academic_periods WHERE name LIKE $1', [like]);
  await sql('DELETE FROM users WHERE email LIKE $1 AND lower(email) <> lower($2)', [
    'qa.role.%@eduarchive.test',
    QA.adminEmail,
  ]);
  await sql('DELETE FROM custody_chain WHERE document_title LIKE $1', [like]);
  await sql('DELETE FROM deletion_logs WHERE document_title LIKE $1', [like]);
}
