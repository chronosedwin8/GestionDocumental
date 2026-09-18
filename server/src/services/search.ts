import { many, one } from '../db/pool.js';
import { resolvePagination, type Paginated } from '../lib/pagination.js';
import { documentAccessClause, expedienteAccessClause, type AuthUser } from './access.js';
import { mapDocument, type DocumentDto } from './documents.js';
import { rankSemantic } from './ai.js';
import { snippetFor } from './aiText.js';
import { getConfigOr, type AiSemanticConfig } from './system.js';

const SELECT_DOC = `
  d.id, d.title, d.type, d.module_code, d.folio_index, d.s3_key, d.s3_bucket,
  d.file_name, d.file_type, d.file_size, d.sha256, d.page_count,
  d.status_code, d.previous_status_code, d.author_id, d.summary, d.ai_status,
  d.ai_error, d.ai_analyzed_at,
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

export type SemanticStrategy = 'lexical' | 'trigram' | 'module_recency';

export type SemanticResult = {
  explanation: string;
  documents: DocumentDto[];
  matches: { document_id: string; reason: string; score: number }[];
  strategy: SemanticStrategy;
  candidates_considered: number;
};

type CandidateRow = {
  id: string;
  title: string;
  type: string;
  module_code: string;
  summary: string | null;
  extracted_text: string | null;
  snippet_raw: string | null;
  score: number;
};

/**
 * Preselección de candidatos que NO depende solo del acierto léxico:
 *   1. full-text (`search_vector`), que ya incluye el texto extraído;
 *   2. si no hay coincidencias, similitud `pg_trgm` sobre título, resumen,
 *      tipo y etiquetas (encuentra variantes, errores de tecleo y plurales);
 *   3. si aún no hay nada, ampliación EXPLÍCITA por módulo y recencia.
 * Cada candidato lleva un fragmento REAL del texto extraído relevante a la
 * consulta (`ts_headline`), no solo el resumen.
 */
async function semanticCandidates(
  user: AuthUser,
  queryText: string,
  moduleCode: string | undefined,
  limit: number,
  trigramThreshold: number,
): Promise<{ rows: CandidateRow[]; strategy: SemanticStrategy }> {
  const runQuery = async (mode: SemanticStrategy): Promise<CandidateRow[]> => {
    const params: unknown[] = [queryText];
    const conditions: string[] = ['d.deleted_at IS NULL'];

    if (moduleCode) {
      params.push(moduleCode);
      conditions.push(`d.module_code = $${params.length}`);
    }

    if (mode === 'lexical') {
      conditions.push(`d.search_vector @@ plainto_tsquery('spanish', unaccent($1))`);
    } else if (mode === 'trigram') {
      params.push(trigramThreshold);
      const th = params.length;
      conditions.push(`(
        similarity(unaccent(lower(d.title)), unaccent(lower($1))) >= $${th}
        OR similarity(unaccent(lower(coalesce(d.summary, ''))), unaccent(lower($1))) >= $${th}
        OR similarity(unaccent(lower(d.type)), unaccent(lower($1))) >= $${th}
        OR EXISTS (
          SELECT 1 FROM document_tags t
           WHERE t.document_id = d.id
             AND similarity(unaccent(lower(t.tag)), unaccent(lower($1))) >= $${th}
        )
      )`);
    }

    conditions.push(await documentAccessClause(user, params));

    const scoreExpr =
      mode === 'lexical'
        ? `ts_rank(d.search_vector, plainto_tsquery('spanish', unaccent($1)))`
        : mode === 'trigram'
          ? `GREATEST(
               similarity(unaccent(lower(d.title)), unaccent(lower($1))),
               similarity(unaccent(lower(coalesce(d.summary, ''))), unaccent(lower($1))),
               similarity(unaccent(lower(d.type)), unaccent(lower($1)))
             )`
          : '0';

    const orderExpr = mode === 'module_recency' ? 'd.created_at DESC' : 'score DESC, d.created_at DESC';

    params.push(limit);

    return many<CandidateRow>(
      `SELECT d.id, d.title, d.type, d.module_code, d.summary, d.extracted_text,
              ${scoreExpr} AS score,
              CASE WHEN d.extracted_text IS NULL THEN NULL ELSE
                ts_headline('spanish', left(d.extracted_text, 200000),
                            plainto_tsquery('spanish', unaccent($1)),
                            'MaxWords=80, MinWords=25, ShortWord=3, MaxFragments=3, FragmentDelimiter=" … ", StartSel="", StopSel="", HighlightAll=FALSE')
              END AS snippet_raw
         FROM documents d
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderExpr}
        LIMIT $${params.length}`,
      params,
    );
  };

  let rows = await runQuery('lexical');
  if (rows.length > 0) return { rows, strategy: 'lexical' };

  rows = await runQuery('trigram');
  if (rows.length > 0) return { rows, strategy: 'trigram' };

  rows = await runQuery('module_recency');
  return { rows, strategy: 'module_recency' };
}

/**
 * Búsqueda semántica sobre el CONTENIDO: preselección robusta + ranking del
 * modelo con un fragmento real de cada documento. Devuelve el motivo y la
 * puntuación por documento. Requiere Gemini configurado.
 */
export async function semanticSearch(
  user: AuthUser,
  queryText: string,
  moduleCode?: string,
): Promise<SemanticResult> {
  const maxCandidates = await getConfigOr<number>('semantic_candidates', 40);
  const cfg = await getConfigOr<AiSemanticConfig>('ai_semantic', {
    snippet_chars: 600,
    max_candidates_to_model: 24,
    trigram_threshold: 0.18,
    min_score: 0.2,
  });

  const { rows, strategy } = await semanticCandidates(
    user,
    queryText,
    moduleCode,
    Math.min(100, maxCandidates),
    cfg.trigram_threshold ?? 0.18,
  );

  if (rows.length === 0) {
    return {
      explanation: 'No hay documentos accesibles para esta consulta.',
      documents: [],
      matches: [],
      strategy,
      candidates_considered: 0,
    };
  }

  const snippetChars = cfg.snippet_chars ?? 600;
  const toModel = rows.slice(0, Math.max(1, cfg.max_candidates_to_model ?? 24));

  const ranked = await rankSemantic(
    queryText,
    toModel.map((row) => {
      const headline = (row.snippet_raw ?? '').trim();
      const snippet =
        headline.length > 0
          ? headline.slice(0, snippetChars)
          : snippetFor(row.extracted_text ?? '', queryText, snippetChars);
      return {
        id: row.id,
        title: row.title,
        type: row.type,
        module_code: row.module_code,
        summary: row.summary,
        snippet,
      };
    }),
    { userId: user.id },
  );

  const ids = ranked.matches.map((m) => m.document_id);
  if (ids.length === 0) {
    return {
      explanation: ranked.explanation || 'Ningún documento accesible responde a la consulta.',
      documents: [],
      matches: [],
      strategy,
      candidates_considered: toModel.length,
    };
  }

  // Se recuperan los documentos completos (etiquetas y metadatos incluidos)
  // y se devuelven en el orden que decidió el modelo.
  const docParams: unknown[] = [ids];
  const access = await documentAccessClause(user, docParams);
  const full = await many(
    `SELECT ${SELECT_DOC} FROM documents d ${JOINS}
      WHERE d.id = ANY($1::uuid[]) AND d.deleted_at IS NULL AND ${access}`,
    docParams,
  );
  const byId = new Map(full.map((row) => [row.id as string, mapDocument(row)]));

  return {
    explanation: ranked.explanation,
    documents: ids.map((id) => byId.get(id)).filter((d): d is DocumentDto => Boolean(d)),
    matches: ranked.matches.filter((m) => byId.has(m.document_id)),
    strategy,
    candidates_considered: toModel.length,
  };
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
