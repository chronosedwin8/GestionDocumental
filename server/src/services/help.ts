import { many, one, query } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';

export type HelpArticleRow = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  module_code: string | null;
  role_codes: string[] | null;
  sort_order: number;
  updated_at: string;
};

export async function listHelpArticles(filters: { module?: string; role?: string }): Promise<HelpArticleRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ['TRUE'];
  if (filters.module) {
    params.push(filters.module);
    conditions.push(`(module_code IS NULL OR module_code = $${params.length})`);
  }
  if (filters.role) {
    params.push(filters.role);
    conditions.push(`(role_codes IS NULL OR $${params.length} = ANY(role_codes))`);
  }
  return many<HelpArticleRow>(
    `SELECT id, slug, title, body_md, module_code, role_codes, sort_order, updated_at
       FROM help_articles WHERE ${conditions.join(' AND ')} ORDER BY sort_order, title`,
    params,
  );
}

export async function getHelpArticle(slug: string): Promise<HelpArticleRow> {
  const row = await one<HelpArticleRow>(
    `SELECT id, slug, title, body_md, module_code, role_codes, sort_order, updated_at
       FROM help_articles WHERE slug = $1`,
    [slug],
  );
  if (!row) throw ApiError.notFound('El artículo de ayuda no existe.');
  return row;
}

export async function upsertHelpArticle(input: {
  slug: string;
  title: string;
  body_md: string;
  module_code?: string | null;
  role_codes?: string[] | null;
  sort_order?: number;
}): Promise<HelpArticleRow> {
  const row = await one<HelpArticleRow>(
    `INSERT INTO help_articles (slug, title, body_md, module_code, role_codes, sort_order)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,0))
     ON CONFLICT (slug) DO UPDATE
       SET title = EXCLUDED.title, body_md = EXCLUDED.body_md, module_code = EXCLUDED.module_code,
           role_codes = EXCLUDED.role_codes, sort_order = EXCLUDED.sort_order
     RETURNING id, slug, title, body_md, module_code, role_codes, sort_order, updated_at`,
    [input.slug, input.title, input.body_md, input.module_code ?? null, input.role_codes ?? null, input.sort_order ?? null],
  );
  if (!row) throw ApiError.internal('No fue posible guardar el artículo.');
  return row;
}

export async function deleteHelpArticle(slug: string): Promise<void> {
  await getHelpArticle(slug);
  await query('DELETE FROM help_articles WHERE slug = $1', [slug]);
}
