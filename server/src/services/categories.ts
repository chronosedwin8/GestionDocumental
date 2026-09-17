import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  module_code: string | null;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  subcategories?: CategoryRow[];
};

export async function listCategories(options: { module?: string; flat?: boolean }): Promise<CategoryRow[]> {
  const params: unknown[] = [];
  let where = 'TRUE';
  if (options.module) {
    params.push(options.module);
    where = `module_code = $${params.length}`;
  }
  const rows = await many<CategoryRow>(
    `SELECT id, name, description, color, module_code, parent_id, is_active, sort_order
       FROM document_categories WHERE ${where}
      ORDER BY module_code, sort_order, name`,
    params,
  );

  if (options.flat) return rows;

  const byId = new Map<string, CategoryRow>();
  for (const row of rows) byId.set(row.id, { ...row, subcategories: [] });

  const tree: CategoryRow[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)?.subcategories?.push(node);
    } else {
      tree.push(node);
    }
  }
  return tree;
}

export async function createCategory(
  userId: string,
  input: {
    name: string;
    description?: string | null;
    color?: string;
    module_code?: string | null;
    parent_id?: string | null;
    sort_order?: number;
  },
): Promise<CategoryRow> {
  const row = await one<CategoryRow>(
    `INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, created_by)
     VALUES ($1,$2,COALESCE($3,'#6366f1'),$4,$5,COALESCE($6,0),$7)
     RETURNING id, name, description, color, module_code, parent_id, is_active, sort_order`,
    [
      input.name,
      input.description ?? null,
      input.color ?? null,
      input.module_code ?? null,
      input.parent_id ?? null,
      input.sort_order ?? null,
      userId,
    ],
  );
  if (!row) throw ApiError.internal('No fue posible crear la categoría.');
  return row;
}

export async function updateCategory(id: string, updates: Record<string, unknown>): Promise<CategoryRow> {
  const fields = ['name', 'description', 'color', 'module_code', 'parent_id', 'is_active', 'sort_order'];
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const field of fields) {
    if (updates[field] === undefined) continue;
    params.push(updates[field]);
    sets.push(`${field} = $${params.length}`);
  }
  if (sets.length > 0) await query(`UPDATE document_categories SET ${sets.join(', ')} WHERE id = $1`, params);
  const row = await one<CategoryRow>(
    `SELECT id, name, description, color, module_code, parent_id, is_active, sort_order
       FROM document_categories WHERE id = $1`,
    [id],
  );
  if (!row) throw ApiError.notFound('La categoría no existe.');
  return row;
}

export async function deleteCategory(id: string): Promise<void> {
  const row = await one<{ id: string }>('SELECT id FROM document_categories WHERE id = $1', [id]);
  if (!row) throw ApiError.notFound('La categoría no existe.');
  await query('DELETE FROM document_categories WHERE id = $1', [id]);
}
