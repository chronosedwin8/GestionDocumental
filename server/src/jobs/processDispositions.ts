import { query } from '../db/pool.js';
import { documentsWithExpiredRetention } from '../services/trd.js';
import { moduleWriterIds, notifyMany } from '../services/notifications.js';
import { getConfigOr } from '../services/system.js';
import { auditSystem } from '../services/audit.js';
import { logCustody } from '../services/custody.js';

/**
 * Ejecuta las disposiciones finales vencidas según la TRD:
 *  - KEEP   → conservación permanente
 *  - DELETE → papelera (nunca purga directa)
 *  - SELECT → notifica para revisión manual
 */
export async function processDispositionsJob(): Promise<Record<string, unknown>> {
  const documents = await documentsWithExpiredRetention();
  const trashDays = await getConfigOr<number>('trash_retention_days', 30);

  let kept = 0;
  let trashed = 0;
  let selected = 0;

  for (const doc of documents) {
    if (doc.action === 'KEEP') {
      await query(`UPDATE documents SET status_code = 'CONSERVACION_PERMANENTE' WHERE id = $1`, [doc.id]);
      kept += 1;
      await logCustody(
        { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: null },
        'TRANSFERRED',
        null,
        { reason: 'Disposición final CONSERVAR aplicada por TRD' },
      );
      await notifyMany(await moduleWriterIds(doc.module_code), {
        type_code: 'RETENTION_ALERT',
        title: 'Documento en conservación permanente',
        message: `El documento "${doc.title}" pasó a conservación permanente al cumplir su retención.`,
        document_id: doc.id,
        data: { disposition: doc.disposition_code, module_code: doc.module_code },
      });
    } else if (doc.action === 'DELETE') {
      await query(
        `SELECT soft_delete_document($1, NULL, $2, $3)`,
        [
          doc.id,
          `Eliminado automáticamente por TRD: plazo de retención cumplido (${String(doc.retention_end_date).slice(0, 10)})`,
          trashDays,
        ],
      );
      trashed += 1;
      await logCustody(
        { id: doc.id, title: doc.title, module_code: doc.module_code, s3_key: null },
        'DELETED',
        null,
        { reason: 'Disposición final ELIMINAR aplicada por TRD' },
      );
      await notifyMany(await moduleWriterIds(doc.module_code), {
        type_code: 'RETENTION_ALERT',
        title: 'Documento enviado a papelera por TRD',
        message: `El documento "${doc.title}" fue enviado a la papelera al vencer su retención.`,
        document_id: doc.id,
        data: { disposition: doc.disposition_code, module_code: doc.module_code },
      });
    } else {
      selected += 1;
      await notifyMany(await moduleWriterIds(doc.module_code), {
        type_code: 'RETENTION_ALERT',
        title: 'Revisión TRD requerida',
        message: `El documento "${doc.title}" cumplió su retención y requiere selección manual (conservar o eliminar).`,
        document_id: doc.id,
        data: { disposition: doc.disposition_code, module_code: doc.module_code },
      });
    }
  }

  await auditSystem('PROCESS_DISPOSITIONS', 'job', null, { kept, trashed, selected });
  return { processed: documents.length, kept, trashed, selected };
}
