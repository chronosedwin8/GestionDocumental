import { many, one } from '../db/pool.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { documentAccessClause, expedienteAccessClause, type AuthUser } from './access.js';
import { mapDocument, type DocumentDto } from './documents.js';
import { rankSemantic } from './ai.js';
import { getConfigOr } from './system.js';

const SELECT_DOC = `
  d.id, d.title, d.type, d.module_code, d.folio_index, d.s3_key, d.s3_bucket,
  d.file_name, d.file_type, d.file_size, d.sha256, d.page_count,
  d.status_code, d.previous_status_code, d.author_id, d.summary, d.ai_status,
  d.category, d.subcategory, d.person_id, d.academic_period_id, d.retention_end_date,
  d.approved_by, d.approved_at, d.approval_sha256,
  d.deleted_at, d.deleted_by, d.delete_reason, d.permanent_delete_at,
  d.created_at, d.updated_at,
  au.full_name AS author_name, au.email AS author_email,
  tg.tags AS tags, md.items AS metadata
`;

const JOINS = `
  LEFT JOIN users au ON au.id = d.author_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(array_agg(t.tag ORDER BY t.tag), '{}') AS tags
      FROM document_tags t WHERE t.document_id = d.id
  ) tg ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'key', m.key, 'value', m.value, 'is_extracted', m.is_extracted, 'confidence', m.confidence
    ) ORDER BY m.key), '[]'::json) AS items
      FROM document_metadata m WHERE m.document_id = d.id
  ) md ON TRUE
`;

export async function fullTextSearch(
  user: AuthUser,
  options: { q: string; module?: string; page?: number; pageSize?: number },
): Promise<Paginated<DocumentDto>> {
  const pagination = resolvePagination(options);
  const params: unknown[] = [];
  const conditions: string[] = ['d.deleted_at IS NULL'];

  const term = (options.q ?? '').trim();
  if (term) {
    params.push(term);
    const idx = params.length;
    params.push(`%${term}%`);
    const likeIdx = params.length;
    conditions.push(`(
      d.search_vector @@ plainto_tsquery('spanish', unaccent($${idx}))
      OR d.title ILIKE $${likeIdx}
      OR d.folio_index ILIKE $${likeIdx}
      OR EXISTS (SELECT 1 FROM document_tags t WHERE t.document_id = d.id AND t.tag ILIKE $${likeIdx})
      OR EXISTS (SELECT 1 FROM document_metadata m WHERE m.document_id = d.id AND m.value ILIKE $${likeIdx})
    )`);
  }

  if (options.module) {
    params.push(options.module);
    conditions.push(`d.module_code = $${params.length}`);
  }

  conditions.push(await documentAccessClause(user, params));
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM documents d WHERE ${where}`,
    params,
  );

  const rankExpr = term
    ? `ts_rank(d.search_vector, plainto_tsquery('spanish', unaccent($1)))`
    : '0';

  params.push(pagination.limit, pagination.offset);
  const rows = await many(
    `SELECT ${SELECT_DOC}, ${rankExpr} AS rank
       FROM documents d ${JOINS}
      WHERE ${where}
      ORDER BY rank DESC, d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    data: rows.map(mapDocument),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: totalRow?.total ?? 0,
  };
}

export type AdvancedFilters = {
  keyword?: string;
  author?: string;
  date_from?: string;
  date_to?: string;
  module?: string;
  tag?: string;
  status?: string;
  type?: string;
  folio?: string;
  person_id?: string;
  page?: number;
  pageSize?: number;
};

export async function advancedSearch(
  user: AuthUser,
  filters: AdvancedFilters,
): Promise<Paginated<DocumentDto>> {
  const pagination = resolvePagination(filters);
  const params: unknown[] = [];
  const conditions: string[] = ['d.deleted_at IS NULL'];

  if (filters.module) {
    params.push(filters.module);
    conditions.push(`d.module_code = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`d.status_code = $${params.length}`);
  }
  if (filters.type) {
    params.push(`%${filters.type}%`);
    conditions.push(`d.type ILIKE $${params.length}`);
  }
  if (filters.folio) {
    params.push(`%${filters.folio}%`);
    conditions.push(`d.folio_index ILIKE $${params.length}`);
  }
  if (filters.person_id) {
    params.push(filters.person_id);
    conditions.push(`d.person_id = $${params.length}`);
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    conditions.push(`d.created_at >= $${params.length}::timestamptz`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    conditions.push(`d.created_at < ($${params.length}::date + 1)::timestamptz`);
  }
  if (filters.author) {
    params.push(`%${filters.author}%`);
    const idx = params.length;
    conditions.push(
      `EXISTS (SELECT 1 FROM users u WHERE u.id = d.author_id AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx}))`,
    );
  }
  if (filters.tag) {
    params.push(`%${filters.tag}%`);
    conditions.push(
      `EXISTS (SELECT 1 FROM document_tags t WHERE t.document_id = d.id AND t.tag ILIKE $${params.length})`,
    );
  }
  if (filters.keyword) {
    params.push(filters.keyword);
    const tsIdx = params.length;
    params.push(`%${filters.keyword}%`);
    const likeIdx = params.length;
    conditions.push(`(
      d.search_vector @@ plainto_tsquery('spanish', unaccent($${tsIdx}))
      OR d.title ILIKE $${likeIdx}
      OR d.summary ILIKE $${likeIdx}
      OR d.folio_index ILIKE $${likeIdx}
      OR d.type ILIKE $${likeIdx}
      OR EXISTS (SELECT 1 FROM document_tags t WHERE t.document_id = d.id AND t.tag ILIKE $${likeIdx})
      OR EXISTS (SELECT 1 FROM document_metadata m WHERE m.document_id = d.id
                  AND (m.value ILIKE $${likeIdx} OR m.key ILIKE $${likeIdx}))
    )`);
  }

  conditions.push(await documentAccessClause(user, params));
  const where = conditions.join(' AND ');

  const totalRow = await one<{ total: number }>(
    `SELECT count(*)::int AS total FROM documents d WHERE ${where}`,
    params,
  );

  params.push(pagination.limit, pagination.offset);
  const rows = await many(
    `SELECT ${SELECT_DOC} FROM documents d ${JOINS}
      WHERE ${where}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    data: rows.map(mapDocument),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: totalRow?.total ?? 0,
  };
}

/** Preselección full-text + ranking del modelo (requiere Gemini configurado). */
export async function semanticSearch(
  user: AuthUser,
  queryText: string,
  moduleCode?: string,
): Promise<{ explanation: string; documents: DocumentDto[] }> {
  const maxCandidates = await getConfigOr<number>('semantic_candidates', 40);
  const candidates = await fullTextSearch(user, {
    q: queryText,
    module: moduleCode,
    page: 1,
    pageSize: Math.min(100, maxCandidates),
  });

  let pool = candidates.data;
  if (pool.length === 0) {
    // Sin coincidencias léxicas: se ofrecen los más recientes accesibles como contexto.
    const recent = await fullTextSearch(user, { q: '', module: moduleCode, page: 1, pageSize: Math.min(100, maxCandidates) });
    pool = recent.data;
  }
  if (pool.length === 0) return { explanation: 'No hay documentos accesibles para esta consulta.', documents: [] };

  const ranked = await rankSemantic(
    queryText,
    pool.map((d) => ({ id: d.id, title: d.title, summary: d.summary })),
  );

  const byId = new Map(pool.map((d) => [d.id, d]));
  const documents = ranked.relevantDocumentIds
    .map((id) => byId.get(id))
    .filter((d): d is DocumentDto => Boolean(d));

  return { explanation: ranked.explanation, documents };
}

export async function globalSearch(user: AuthUser, term: string) {
  const like = `%${term}%`;

  const docs = await fullTextSearch(user, { q: term, page: 1, pageSize: 5 });

  const expParams: unknown[] = [like];
  const expAccess = await expedienteAccessClause(user, expParams);
  const expedientes = await many(
    `SELECT e.*, (SELECT count(*)::int FROM expediente_documents ed WHERE ed.expediente_id = e.id) AS document_count
       FROM expedientes e
      WHERE (e.titulo ILIKE $1 OR e.radicado ILIKE $1) AND ${expAccess}
      ORDER BY e.created_at DESC LIMIT 5`,
    expParams,
  );

  const people = await many(
    `SELECT id, type_code, document_number, first_name, last_name,
            (first_name || ' ' || last_name) AS full_name, status
       FROM people
      WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR document_number ILIKE $1
      ORDER BY last_name, first_name LIMIT 5`,
    [like],
  );

  return { documents: docs.data, expedientes, people };
}
