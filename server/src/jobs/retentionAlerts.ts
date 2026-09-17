import { one } from '../db/pool.js';
import { documentsNearRetention } from '../services/trd.js';
import { correspondenceDueSoon } from '../services/expedientes.js';
import { moduleWriterIds, notifyMany } from '../services/notifications.js';
import { getConfigOr } from '../services/system.js';

/**
 * Crea alertas de retención (documentos por vencer) y de correspondencia
 * con plazo de respuesta próximo. Evita duplicados en las últimas 24 horas.
 */
export async function retentionAlertsJob(): Promise<Record<string, unknown>> {
  const days = await getConfigOr<number>('retention_alert_days', 30);
  const documents = await documentsNearRetention(days);

  let created = 0;
  for (const doc of documents) {
    const recent = await one<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM notifications
          WHERE document_id = $1 AND type_code = 'RETENTION_ALERT'
            AND created_at > now() - interval '1 day'
       ) AS exists`,
      [doc.id],
    );
    if (recent?.exists) continue;

    const recipients = await moduleWriterIds(doc.module_code);
    created += await notifyMany(recipients, {
      type_code: 'RETENTION_ALERT',
      title: 'Alerta de retención documental',
      message: `El documento "${doc.title}" vence su retención el ${String(doc.retention_end_date).slice(0, 10)}.`,
      document_id: doc.id,
      data: { module_code: doc.module_code, retention_end_date: doc.retention_end_date },
    });
  }

  const correspondence = await correspondenceDueSoon(5);
  let correspondenceAlerts = 0;
  for (const exp of correspondence) {
    const recent = await one<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM notifications
          WHERE type_code = 'CORRESPONDENCE_DUE'
            AND data->>'expediente_id' = $1
            AND created_at > now() - interval '1 day'
       ) AS exists`,
      [exp.id],
    );
    if (recent?.exists) continue;

    const recipients = await moduleWriterIds(exp.module_code);
    correspondenceAlerts += await notifyMany(recipients, {
      type_code: 'CORRESPONDENCE_DUE',
      title: 'Correspondencia por vencer',
      message: `La correspondencia ${exp.radicado} — "${exp.titulo}" debe responderse antes del ${String(
        exp.response_due_at,
      ).slice(0, 10)}.`,
      data: { expediente_id: exp.id, module_code: exp.module_code, response_due_at: exp.response_due_at },
    });
  }

  return {
    documents_near_retention: documents.length,
    retention_notifications: created,
    correspondence_due: correspondence.length,
    correspondence_notifications: correspondenceAlerts,
  };
}
