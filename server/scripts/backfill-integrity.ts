/**
 * ============================================================
 * Backfill de integridad de los documentos migrados.
 *
 *   npm --prefix server run backfill:integrity -- [opciones]
 *
 * Para cada documento con archivo presente en S3:
 *   1. HeadObject  → comprueba existencia y tamaño real.
 *   2. GetObject   → descarga el contenido.
 *   3. sha256 + file_size + page_count + extracted_text
 *      (reutiliza `src/services/extraction.ts`).
 *   4. UPDATE de la fila; el trigger `trg_documents_search_vector`
 *      refresca `search_vector` con el texto extraído (peso D).
 *
 * Opciones:
 *   --only-missing   Solo documentos sin sha256 (por defecto: todos).
 *   --dry-run        Informa sin escribir.
 *   --id=<uuid>      Limita a un documento.
 *   --skip-trash     Excluye los documentos en la papelera
 *                    (por defecto SÍ se procesan: son restaurables).
 * ============================================================
 */
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { closePool, pool } from '../src/db/pool.js';
import { getStorage } from '../src/services/storage.js';
import { extractText } from '../src/services/extraction.js';
import { sha256Hex } from '../src/lib/crypto.js';

type DocRow = {
  id: string;
  title: string;
  s3_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  sha256: string | null;
};

type Outcome = {
  id: string;
  title: string;
  key: string;
  status: 'OK' | 'FALTA_EN_S3' | 'ERROR';
  sha256?: string;
  bytes?: number;
  pages?: number | null;
  chars?: number;
  message?: string;
};

function parseArgs(argv: string[]): {
  onlyMissing: boolean;
  dryRun: boolean;
  id: string | null;
  skipTrash: boolean;
} {
  let onlyMissing = false;
  let dryRun = false;
  let skipTrash = false;
  let id: string | null = null;
  for (const arg of argv) {
    if (arg === '--only-missing') onlyMissing = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--skip-trash') skipTrash = true;
    else if (arg.startsWith('--id=')) id = arg.slice('--id='.length);
    else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`);
  }
  return { onlyMissing, dryRun, id, skipTrash };
}

async function toBuffer(body: unknown): Promise<Buffer> {
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`=== Backfill de integridad${options.dryRun ? ' (--dry-run)' : ''} ===`);

  const { client: s3, config } = await getStorage();
  console.log(`Bucket: ${config.bucket} · región ${config.region}`);

  const where: string[] = ['true'];
  const params: unknown[] = [];
  if (options.skipTrash) where.push('deleted_at IS NULL');
  if (options.onlyMissing) where.push('sha256 IS NULL');
  if (options.id) {
    params.push(options.id);
    where.push(`id = $${params.length}::uuid`);
  }

  const { rows } = await pool.query<DocRow>(
    `SELECT id, title, s3_key, file_name, file_type, file_size, sha256
       FROM documents
      WHERE ${where.join(' AND ')}
      ORDER BY created_at`,
    params as never[],
  );

  console.log(`Documentos a procesar: ${rows.length}\n`);
  const outcomes: Outcome[] = [];

  // El backfill es una operación del sistema, no una edición del documento:
  // no debe pisar `updated_at`, que es la fecha archivística heredada del legado.
  if (!options.dryRun) await pool.query('ALTER TABLE documents DISABLE TRIGGER trg_documents_updated');

  try {
    for (const doc of rows) {
      const base: Outcome = {
        id: doc.id,
        title: doc.title,
        key: doc.s3_key,
        status: 'OK',
      };
      try {
        await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: doc.s3_key }));
      } catch (error) {
        const name = (error as { name?: string }).name ?? '';
        if (name === 'NotFound' || name === 'NoSuchKey' || name === '403' || name === 'Forbidden') {
          outcomes.push({ ...base, status: 'FALTA_EN_S3', message: name });
          console.log(`  ✖ FALTA EN S3  ${doc.title}`);
          continue;
        }
        outcomes.push({
          ...base,
          status: 'ERROR',
          message: (error as Error).message,
        });
        console.log(`  ! ERROR        ${doc.title}: ${(error as Error).message}`);
        continue;
      }

      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: doc.s3_key }));
        const buffer = await toBuffer(object.Body);
        const digest = sha256Hex(buffer);
        const extracted = await extractText(buffer, doc.file_type, doc.file_name);

        if (!options.dryRun) {
          await pool.query(
            `UPDATE documents
              SET sha256 = $2,
                  file_size = $3,
                  page_count = COALESCE($4, page_count),
                  extracted_text = COALESCE($5, extracted_text)
            WHERE id = $1`,
            [doc.id, digest, buffer.byteLength, extracted.pageCount, extracted.text] as never[],
          );
        }

        outcomes.push({
          ...base,
          sha256: digest,
          bytes: buffer.byteLength,
          pages: extracted.pageCount,
          chars: extracted.text?.length ?? 0,
        });
        console.log(
          `  ✓ ${doc.title.slice(0, 48).padEnd(48)} ${String(buffer.byteLength).padStart(9)} B · ` +
            `${extracted.pageCount ?? '-'} pág · ${extracted.text?.length ?? 0} car`,
        );
      } catch (error) {
        outcomes.push({
          ...base,
          status: 'ERROR',
          message: (error as Error).message,
        });
        console.log(`  ! ERROR        ${doc.title}: ${(error as Error).message}`);
      }
    }
  } finally {
    if (!options.dryRun) await pool.query('ALTER TABLE documents ENABLE TRIGGER trg_documents_updated');
  }

  const ok = outcomes.filter((o) => o.status === 'OK');
  const missing = outcomes.filter((o) => o.status === 'FALTA_EN_S3');
  const failed = outcomes.filter((o) => o.status === 'ERROR');
  const withText = ok.filter((o) => (o.chars ?? 0) > 0);
  const withPages = ok.filter((o) => o.pages !== null && o.pages !== undefined);

  console.log('\n--- Resultado ---');
  console.log(`  Procesados            : ${outcomes.length}`);
  console.log(`  Con sha256 y tamaño   : ${ok.length}`);
  console.log(`  Con texto extraído    : ${withText.length}`);
  console.log(`  Con número de páginas : ${withPages.length}`);
  console.log(`  Ausentes en S3        : ${missing.length}`);
  console.log(`  Con error             : ${failed.length}`);

  if (missing.length > 0) {
    console.log('\nArchivos que NO existen en S3 (no se borra nada):');
    for (const m of missing) console.log(`  · ${m.title} → ${m.key}`);
  }
  if (failed.length > 0) {
    console.log('\nErrores:');
    for (const f of failed) console.log(`  · ${f.title}: ${f.message}`);
  }

  if (!options.dryRun) {
    const { rows: summary } = await pool.query<{
      total: number;
      con_sha: number;
      con_texto: number;
      con_vector: number;
    }>(
      `SELECT count(*)::int                                            AS total,
              count(sha256)::int                                       AS con_sha,
              count(extracted_text)::int                               AS con_texto,
              count(*) FILTER (WHERE search_vector IS NOT NULL)::int   AS con_vector
         FROM documents`,
    );
    console.log('\nEstado en la base:', summary[0]);
  }
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error: Error) => {
    console.error(`\n✖ ${error.message}`);
    await closePool();
    process.exit(1);
  });
