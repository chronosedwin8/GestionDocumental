/**
 * Catálogos reales que alimentan los prompts de IA.
 *
 * Nada aquí está escrito a mano: los tipos documentales salen de la TRD
 * (`retention_rules`), las series y subseries de `document_categories`,
 * el vocabulario de etiquetas de `document_tags` y los campos de metadatos
 * de `system_config.ai_metadata_fields`.
 */
import { many } from '../db/pool.js';
import { getConfigOr, type AiMetadataField } from './system.js';

export type TrdCatalog = {
  module_code: string;
  document_types: string[];
  series: { name: string; subseries: string[] }[];
};

export async function getTrdCatalog(moduleCode: string): Promise<TrdCatalog> {
  const types = await many<{ document_type: string }>(
    'SELECT document_type FROM retention_rules WHERE module_code = $1 ORDER BY document_type',
    [moduleCode],
  );

  const categories = await many<{ name: string; parent_name: string | null }>(
    `SELECT c.name, p.name AS parent_name
       FROM document_categories c
       LEFT JOIN document_categories p ON p.id = c.parent_id
      WHERE c.module_code = $1 AND c.is_active = true
      ORDER BY COALESCE(p.sort_order, c.sort_order), COALESCE(p.name, c.name), c.sort_order, c.name`,
    [moduleCode],
  );

  const series = new Map<string, string[]>();
  for (const row of categories) {
    if (row.parent_name) {
      const list = series.get(row.parent_name) ?? [];
      list.push(row.name);
      series.set(row.parent_name, list);
    } else if (!series.has(row.name)) {
      series.set(row.name, []);
    }
  }

  return {
    module_code: moduleCode,
    document_types: types.map((t) => t.document_type),
    series: [...series.entries()].map(([name, subseries]) => ({ name, subseries })),
  };
}

/** Módulos disponibles, para que la IA pueda señalar otra dependencia. */
export async function getModuleCatalog(): Promise<{ code: string; name: string }[]> {
  return many<{ code: string; name: string }>(
    'SELECT code, name FROM modules WHERE is_active = true ORDER BY sort_order, name',
  );
}

/** Etiquetas ya usadas en el módulo, de la más frecuente a la menos. */
export async function getTagVocabulary(moduleCode: string | null, limit: number): Promise<string[]> {
  const rows = moduleCode
    ? await many<{ tag: string }>(
        `SELECT t.tag
           FROM document_tags t
           JOIN documents d ON d.id = t.document_id AND d.deleted_at IS NULL
          WHERE d.module_code = $1
          GROUP BY t.tag
          ORDER BY count(*) DESC, t.tag
          LIMIT $2`,
        [moduleCode, limit],
      )
    : await many<{ tag: string }>(
        `SELECT t.tag
           FROM document_tags t
           JOIN documents d ON d.id = t.document_id AND d.deleted_at IS NULL
          GROUP BY t.tag
          ORDER BY count(*) DESC, t.tag
          LIMIT $1`,
        [limit],
      );
  return rows.map((r) => r.tag);
}

export async function getMetadataFields(): Promise<AiMetadataField[]> {
  const fields = await getConfigOr<AiMetadataField[]>('ai_metadata_fields', []);
  return fields.filter((f): f is AiMetadataField => Boolean(f && typeof f.key === 'string' && f.key.length > 0));
}
