import { logger } from '../lib/logger.js';
import { auditSystem } from '../services/audit.js';
import { purgeDocument } from '../services/deletion.js';
import { documentsDueForPurge } from '../services/trash.js';

/** Purga física de la papelera: borra en S3, registra el log y el acta. */
export async function purgeTrashJob(): Promise<Record<string, unknown>> {
  const due = await documentsDueForPurge();
  let purged = 0;
  const errors: string[] = [];

  for (const doc of due) {
    try {
      await purgeDocument(
        doc.id,
        { id: null, full_name: 'Sistema (purga automática)', role_code: 'SISTEMA' },
        doc.delete_reason ?? 'Purga automática tras cumplirse el plazo de papelera',
      );
      purged += 1;
    } catch (error) {
      logger.error({ err: error, documentId: doc.id }, 'Error purgando documento');
      errors.push(doc.id);
    }
  }

  await auditSystem('PURGE_TRASH', 'job', null, { purged, errors: errors.length });
  return { candidates: due.length, purged, errors };
}
