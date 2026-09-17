import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import type { AuthUser } from './access.js';
import { canAccessModule } from './access.js';

export type RetentionRuleRow = {
  id: string;
  module_code: string;
  document_type: string;
  retention_years: number;
  disposition_code: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listRules(moduleCode?: string): Promise<RetentionRuleRow[]> {
  if (moduleCode) {
    return many<RetentionRuleRow>(
      'SELECT * FROM retention_rules WHERE module_code = $1 ORDER BY document_type',
      [moduleCode],
    );
  }
  return many<RetentionRuleRow>('SELECT * FROM retention_rules ORDER BY module_code, document_type');
}

async function assertCanManage(user: AuthUser, moduleCode: string): Promise<void> {
  if (user.role.has_full_access || user.role_code === 'ARCHIVISTA') return;
  const allowed = await canAccessModule(user, moduleCode, 'write');
  if (!allowed) throw ApiError.forbidden('No tienes permiso para administrar la TRD de este módulo.');
}

export type NewRetentionRule = {
  module_code: string;
  document_type: string;
  retention_years: number;
  disposition_code: string;
  description?: string | null;
};

export async function createRule(user: AuthUser, input: NewRetentionRule) {
  await assertCanManage(user, input.module_code);
  return one<RetentionRuleRow>(
    `INSERT INTO retention_rules (module_code, document_type, retention_years, disposition_code, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (module_code, document_type) DO UPDATE
       SET retention_years = EXCLUDED.retention_years,
           disposition_code = EXCLUDED.disposition_code,
           description = EXCLUDED.description
     RETURNING *`,
    [
      input.module_code,
      input.document_type,
      input.retention_years,
      input.disposition_code,
      input.description ?? null,
      user.id,
    ],
  );
}

export async function updateRule(user: AuthUser, id: string, updates: Record<string, unknown>) {
  const rule = await one<RetentionRuleRow>('SELECT * FROM retention_rules WHERE id = $1', [id]);
  if (!rule) throw ApiError.notFound('La regla de retención no existe.');
  await assertCanManage(user, rule.module_code);

  const fields = ['module_code', 'document_type', 'retention_years', 'disposition_code', 'description'];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) await query(`UPDATE retention_rules SET ${sets.join(', ')} WHERE id = $1`, params);
  return one<RetentionRuleRow>('SELECT * FROM retention_rules WHERE id = $1', [id]);
}

export async function deleteRule(user: AuthUser, id: string): Promise<void> {
  const rule = await one<RetentionRuleRow>('SELECT * FROM retention_rules WHERE id = $1', [id]);
  if (!rule) throw ApiError.notFound('La regla de retención no existe.');
  await assertCanManage(user, rule.module_code);
  await query('DELETE FROM retention_rules WHERE id = $1', [id]);
}

/** Documentos próximos a vencer su retención (para alertas y semáforo). */
export async function documentsNearRetention(days: number) {
  return many<{ id: string; title: string; module_code: string; retention_end_date: string }>(
    `SELECT id, title, module_code, retention_end_date
       FROM documents
      WHERE deleted_at IS NULL
        AND retention_end_date IS NOT NULL
        AND retention_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + $1::int)`,
    [days],
  );
}

/** Documentos vencidos con su disposición final (para el job de disposiciones). */
export async function documentsWithExpiredRetention() {
  return many<{
    id: string;
    title: string;
    module_code: string;
    retention_end_date: string;
    disposition_code: string;
    action: string;
  }>(
    `SELECT d.id, d.title, d.module_code, d.retention_end_date, rr.disposition_code, dp.action
       FROM documents d
       JOIN retention_rules rr ON rr.module_code = d.module_code AND rr.document_type = d.type
       JOIN dispositions dp ON dp.code = rr.disposition_code
      WHERE d.retention_end_date <= CURRENT_DATE
        AND d.deleted_at IS NULL
        AND d.status_code NOT IN ('ARCHIVO_HISTORICO', 'CONSERVACION_PERMANENTE', 'APROBADO', 'BLOQUEO_ADMIN')`,
  );
}
