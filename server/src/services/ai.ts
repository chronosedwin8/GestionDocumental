/**
 * Operaciones de IA del SGDEA sobre Google Gemini.
 *
 * Principios (docs/AI_ANALISIS.md §4):
 *  - Salida estructurada con `responseSchema`: no hay parseo por expresiones regulares.
 *  - El documento se analiza COMPLETO por bloques con solapamiento y consolidación.
 *  - La IA elige siempre entre el catálogo real de la base; no inventa.
 *  - La IA **sugiere**: ninguna función de este módulo cambia tipo documental,
 *    serie ni retención de un documento.
 *  - Sin clave configurada se lanza 503 AI_NOT_CONFIGURED; nunca se simula.
 */
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  fingerprintOf,
  generateStructured,
  generateText,
  streamGenerate,
  type AiOperation,
  type GeminiPart,
  type JsonSchema,
  type TokenUsage,
} from './aiClient.js';
import { getMetadataFields, getTagVocabulary, getTrdCatalog, type TrdCatalog } from './aiCatalog.js';
import {
  chunkText,
  consolidateTags,
  coveredChars,
  deriveCitations,
  selectRelevantWindows,
  type Citation,
  type RelevantWindow,
} from './aiText.js';
import {
  getAiLimits,
  getAiModel,
  getAiVisionModel,
  getConfigOr,
  type AiChatSourcesConfig,
  type AiMetadataField,
} from './system.js';

export type AiSuggestion = { value: string; confidence: number; reason: string; uncertain?: boolean };

export type AiClassification = {
  document_type: AiSuggestion[];
  serie: AiSuggestion[];
  subserie: AiSuggestion[];
  module_code: AiSuggestion | null;
};

export type AiExtractedField = { key: string; value: string; confidence: number; uncertain?: boolean };

export type AnalyzeResult = {
  summary: string;
  tags: string[];
  chunks: number;
  analyzed_chars: number;
  total_chars: number;
  cached: boolean;
  usage: TokenUsage;
};

export type SemanticCandidate = {
  id: string;
  title: string;
  type: string;
  module_code: string;
  summary: string | null;
  snippet: string | null;
};

export type SemanticMatch = { document_id: string; reason: string; score: number };

export type OcrResult = {
  text: string | null;
  pages_processed: number;
  page_count: number | null;
  cached: boolean;
  usage: TokenUsage;
};

// ── Esquemas de salida ──────────────────────────────────────

const CHUNK_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING', description: 'Resumen fiel del bloque en español, de 40 a 70 palabras.' },
    puntos_clave: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Hechos, cifras, fechas, partes o decisiones concretas presentes en el bloque.',
    },
  },
  required: ['resumen', 'puntos_clave'],
};

const ANALYZE_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    resumen: {
      type: 'STRING',
      description:
        'Párrafo único en español de 130 a 150 palabras con el propósito del documento, las partes involucradas, los hechos principales y las acciones o solicitudes relevantes.',
    },
    etiquetas: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Etiquetas archivísticas en minúsculas, reutilizando el vocabulario existente.',
    },
  },
  required: ['resumen', 'etiquetas'],
};

const suggestionSchema = (description: string): JsonSchema => ({
  type: 'ARRAY',
  description,
  items: {
    type: 'OBJECT',
    properties: {
      value: { type: 'STRING', description: 'Valor EXACTO tomado del catálogo entregado.' },
      confidence: { type: 'NUMBER', description: 'Confianza entre 0 y 1.' },
      reason: { type: 'STRING', description: 'Motivo breve, en español, apoyado en el contenido.' },
    },
    required: ['value', 'confidence', 'reason'],
  },
});

const CLASSIFY_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    document_type: suggestionSchema('Tipos documentales candidatos, ordenados por confianza.'),
    serie: suggestionSchema('Series documentales candidatas, ordenadas por confianza.'),
    subserie: suggestionSchema('Subseries documentales candidatas, ordenadas por confianza.'),
    module_code: {
      type: 'OBJECT',
      nullable: true,
      description: 'Solo si el contenido indica claramente otra dependencia; en caso contrario, null.',
      properties: {
        value: { type: 'STRING' },
        confidence: { type: 'NUMBER' },
        reason: { type: 'STRING' },
      },
      required: ['value', 'confidence', 'reason'],
    },
  },
  required: ['document_type', 'serie', 'subserie'],
};

const METADATA_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    campos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING', description: 'Clave EXACTA de la lista de campos solicitada.' },
          value: { type: 'STRING', description: 'Valor tal como aparece en el documento.' },
          confidence: { type: 'NUMBER', description: 'Confianza entre 0 y 1.' },
        },
        required: ['key', 'value', 'confidence'],
      },
      description: 'Solo los campos realmente presentes en el documento. Omite los que no aparezcan.',
    },
  },
  required: ['campos'],
};

const SEMANTIC_SCHEMA: JsonSchema = {
  type: 'OBJECT',
  properties: {
    explanation: {
      type: 'STRING',
      description: 'Explicación en español de por qué esos documentos responden a la consulta (máximo 2 párrafos).',
    },
    matches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          document_id: { type: 'STRING', description: 'Identificador EXACTO de la lista entregada.' },
          reason: { type: 'STRING', description: 'Motivo concreto, apoyado en el fragmento mostrado.' },
          score: { type: 'NUMBER', description: 'Relevancia entre 0 y 1.' },
        },
        required: ['document_id', 'reason', 'score'],
      },
    },
  },
  required: ['explanation', 'matches'],
};

// ── Ayudas comunes ──────────────────────────────────────────

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

async function confidenceThreshold(): Promise<number> {
  return getConfigOr<number>('ai_confidence_threshold', 0.6);
}

function textPart(text: string): GeminiPart {
  return { text };
}

function catalogBlock(catalog: TrdCatalog): string {
  const series = catalog.series
    .map((s) => (s.subseries.length > 0 ? `- ${s.name}\n${s.subseries.map((x) => `    · ${x}`).join('\n')}` : `- ${s.name}`))
    .join('\n');
  return [
    `TIPOS DOCUMENTALES DE LA TRD DEL MÓDULO ${catalog.module_code} (${catalog.document_types.length}):`,
    catalog.document_types.map((t) => `- ${t}`).join('\n') || '(sin reglas TRD registradas)',
    '',
    'SERIES Y SUBSERIES DEL MÓDULO:',
    series || '(sin series registradas)',
  ].join('\n');
}

// ── 1. Análisis del documento completo por bloques ──────────

type ChunkSummary = { resumen: string; puntos_clave: string[] };
type AnalyzePayload = { resumen: string; etiquetas: string[] };

export type AnalyzeOptions = {
  moduleCode?: string | null;
  documentId?: string | null;
  userId?: string | null;
};

/**
 * Resume y etiqueta el documento COMPLETO: lo trocea con solapamiento, resume
 * cada bloque y consolida. `ai_limits.analyze_chars` es el tamaño del bloque,
 * no un recorte del documento.
 */
export async function analyzeDocument(
  fileName: string,
  text: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const limits = await getAiLimits();
  const model = await getAiModel();
  const source = (text ?? '').trim();

  if (source.length === 0) {
    throw ApiError.unprocessable('El documento no tiene texto extraído para analizar.');
  }

  const chunks = chunkText(source, limits.analyze_chars, limits.analyze_chunk_overlap, limits.analyze_max_chunks);
  const analyzedChars = coveredChars(chunks);

  const [vocabulary, catalog, maxTags] = await Promise.all([
    getTagVocabulary(options.moduleCode ?? null, await getConfigOr<number>('ai_tag_vocabulary_size', 60)),
    options.moduleCode ? getTrdCatalog(options.moduleCode) : Promise.resolve(null),
    getConfigOr<number>('ai_max_tags', 5),
  ]);

  const usage: TokenUsage = { input: 0, output: 0 };
  let allCached = true;

  // Paso 1 — resumen breve de cada bloque (se omite si solo hay uno).
  const partials: ChunkSummary[] = [];
  if (chunks.length > 1) {
    for (const chunk of chunks) {
      const result = await generateStructured<ChunkSummary>({
        operation: 'ANALYZE',
        model,
        maxTokens: limits.analyze_max_tokens,
        temperature: 0.2,
        schema: CHUNK_SCHEMA,
        fingerprint: fingerprintOf('analyze-chunk', chunk.text),
        documentId: options.documentId ?? null,
        userId: options.userId ?? null,
        parts: [
          textPart(
            `Eres un archivista experto en gestión documental colombiana.
Estás leyendo el BLOQUE ${chunk.index + 1} de ${chunks.length} del documento "${fileName}".

CONTENIDO DEL BLOQUE:
${chunk.text}

Resume con fidelidad SOLO lo que dice este bloque. No supongas nada sobre el resto del documento.`,
          ),
        ],
      });
      partials.push(result.data);
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      if (!result.cached) allCached = false;
    }
  }

  // Paso 2 — consolidación final.
  const consolidatedSource =
    chunks.length > 1
      ? partials
          .map(
            (p, i) =>
              `BLOQUE ${i + 1}: ${p.resumen}\nPUNTOS CLAVE: ${(p.puntos_clave ?? []).join(' · ') || '(ninguno)'}`,
          )
          .join('\n\n')
      : chunks[0]?.text ?? '';

  const vocabularyBlock =
    vocabulary.length > 0
      ? `ETIQUETAS YA USADAS EN ESTE MÓDULO (REUTILÍZALAS ANTES DE CREAR NINGUNA NUEVA):\n${vocabulary.join(', ')}`
      : 'No hay etiquetas previas en el módulo: crea etiquetas archivísticas breves y reutilizables.';

  const seriesBlock =
    catalog && catalog.series.length > 0
      ? `SERIES DOCUMENTALES DEL MÓDULO (úsalas como vocabulario preferente):\n${catalog.series.map((s) => s.name).join(', ')}`
      : '';

  const finalResult = await generateStructured<AnalyzePayload>({
    operation: 'ANALYZE',
    model,
    maxTokens: limits.analyze_max_tokens,
    temperature: 0.3,
    schema: ANALYZE_SCHEMA,
    // Huella por contenido (docs/AI_ANALISIS.md §4.3): el reanálisis idéntico
    // no vuelve a pagar aunque el vocabulario del módulo haya crecido.
    fingerprint: fingerprintOf('analyze-final', fileName, consolidatedSource),
    documentId: options.documentId ?? null,
    userId: options.userId ?? null,
    parts: [
      textPart(
        `Eres un archivista experto en gestión documental colombiana.

DOCUMENTO: "${fileName}"
${chunks.length > 1 ? `El documento se leyó completo en ${chunks.length} bloques. A continuación el resumen de cada bloque:` : 'CONTENIDO DEL DOCUMENTO:'}

${consolidatedSource}

${vocabularyBlock}
${seriesBlock}

INSTRUCCIONES:
1. Escribe UN párrafo de 130 a 150 palabras que describa el documento ENTERO, no solo su inicio: propósito, partes involucradas, hechos principales y acciones o solicitudes relevantes. Incluye cifras, fechas y números concretos si aparecen.
2. Propón como máximo ${maxTags} etiquetas en minúsculas. Reutiliza literalmente una etiqueta existente siempre que describa el documento; solo crea una nueva si ninguna sirve.
3. No inventes datos que no estén en el contenido.`,
      ),
    ],
  });

  usage.input += finalResult.usage.input;
  usage.output += finalResult.usage.output;
  if (!finalResult.cached) allCached = false;

  const summary = (finalResult.data.resumen ?? '').trim();
  if (summary.length === 0) {
    throw ApiError.internal('El servicio de IA no devolvió un resumen del documento.');
  }

  const tags = consolidateTags(finalResult.data.etiquetas ?? [], vocabulary, maxTags);

  return {
    summary,
    tags,
    chunks: chunks.length,
    analyzed_chars: analyzedChars,
    total_chars: source.length,
    cached: allCached,
    usage,
  };
}

// ── 2. Sugerencia de clasificación TRD ──────────────────────

type ClassifyPayload = {
  document_type?: { value: string; confidence: number; reason: string }[];
  serie?: { value: string; confidence: number; reason: string }[];
  subserie?: { value: string; confidence: number; reason: string }[];
  module_code?: { value: string; confidence: number; reason: string } | null;
};

/**
 * Propone tipo documental, serie y subserie ELIGIENDO del catálogo real del
 * módulo. Todo valor que no pertenezca al catálogo se descarta al validar.
 * No modifica el documento: solo sugiere.
 */
export async function classifyDocument(input: {
  moduleCode: string;
  fileName: string;
  text: string;
  modules?: { code: string; name: string }[];
  documentId?: string | null;
  userId?: string | null;
}): Promise<AiClassification> {
  const limits = await getAiLimits();
  const model = await getAiModel();
  const catalog = await getTrdCatalog(input.moduleCode);
  const perField = await getConfigOr<number>('ai_suggestions_per_field', 3);
  const threshold = await confidenceThreshold();

  if (catalog.document_types.length === 0 && catalog.series.length === 0) {
    throw ApiError.unprocessable(
      `El módulo ${input.moduleCode} no tiene reglas TRD ni series registradas: no hay catálogo del que elegir.`,
    );
  }

  const content = (input.text ?? '').trim();
  if (content.length === 0) {
    throw ApiError.unprocessable('No hay texto del documento para clasificar.');
  }

  // Se envían el principio y el final: la carátula identifica el tipo y el
  // cierre suele traer firmas y anexos.
  const windows = selectRelevantWindows(content, input.fileName, limits.classify_chars, 2500);
  const contextText = windows.map((w) => `[car. ${w.start}]\n${w.text}`).join('\n\n');

  const modulesBlock =
    input.modules && input.modules.length > 0
      ? `DEPENDENCIAS (module_code) DISPONIBLES:\n${input.modules.map((m) => `- ${m.code}: ${m.name}`).join('\n')}`
      : '';

  const result = await generateStructured<ClassifyPayload>({
    operation: 'CLASSIFY',
    model,
    maxTokens: limits.classify_max_tokens,
    temperature: 0.1,
    schema: CLASSIFY_SCHEMA,
    fingerprint: fingerprintOf('classify', input.moduleCode, input.fileName, contextText, catalogBlock(catalog)),
    documentId: input.documentId ?? null,
    userId: input.userId ?? null,
    parts: [
      textPart(
        `Eres un archivista colombiano que clasifica documentos según la Tabla de Retención Documental (TRD).

ARCHIVO: "${input.fileName}"
MÓDULO ACTUAL: ${input.moduleCode}

${catalogBlock(catalog)}

${modulesBlock}

CONTENIDO DEL DOCUMENTO (fragmentos con su desplazamiento en el texto):
${contextText}

REGLAS ESTRICTAS:
1. Elige ÚNICA Y EXCLUSIVAMENTE valores que aparezcan LITERALMENTE en los catálogos anteriores. Está prohibido inventar tipos, series o subseries.
2. Devuelve hasta ${perField} candidatas por campo, ordenadas de mayor a menor confianza, cada una con el motivo apoyado en el contenido.
3. Si ninguna opción del catálogo encaja para un campo, devuelve una lista vacía para ese campo. Es preferible no proponer nada a proponer algo falso.
4. Declara la confianza con honestidad: si dudas, usa un valor bajo.
5. Rellena "module_code" solo si el contenido indica claramente que el documento pertenece a otra dependencia; en caso contrario, null.`,
      ),
    ],
  });

  const typeSet = new Set(catalog.document_types);
  const serieSet = new Set(catalog.series.map((s) => s.name));
  const subserieSet = new Set(catalog.series.flatMap((s) => s.subseries));
  const moduleSet = new Set((input.modules ?? []).map((m) => m.code));

  const validate = (
    items: { value: string; confidence: number; reason: string }[] | undefined,
    allowed: Set<string>,
  ): AiSuggestion[] => {
    const seen = new Set<string>();
    const out: AiSuggestion[] = [];
    for (const item of items ?? []) {
      const value = (item?.value ?? '').trim();
      if (!allowed.has(value) || seen.has(value)) continue;
      seen.add(value);
      const confidence = clampConfidence(item.confidence);
      out.push({
        value,
        confidence,
        reason: (item.reason ?? '').trim(),
        uncertain: confidence < threshold,
      });
      if (out.length >= perField) break;
    }
    return out.sort((a, b) => b.confidence - a.confidence);
  };

  const moduleSuggestion = result.data.module_code;
  const moduleValue = (moduleSuggestion?.value ?? '').trim();
  const moduleOut: AiSuggestion | null =
    moduleSuggestion && moduleSet.has(moduleValue) && moduleValue !== input.moduleCode
      ? {
          value: moduleValue,
          confidence: clampConfidence(moduleSuggestion.confidence),
          reason: (moduleSuggestion.reason ?? '').trim(),
          uncertain: clampConfidence(moduleSuggestion.confidence) < threshold,
        }
      : null;

  return {
    document_type: validate(result.data.document_type, typeSet),
    serie: validate(result.data.serie, serieSet),
    subserie: validate(result.data.subserie, subserieSet),
    module_code: moduleOut,
  };
}

// ── 3. Extracción de metadatos ──────────────────────────────

type MetadataPayload = { campos?: { key: string; value: string; confidence: number }[] };

/** Extrae los campos de `system_config.ai_metadata_fields` presentes en el documento. */
export async function extractMetadata(input: {
  fileName: string;
  text: string;
  fields?: AiMetadataField[];
  documentId?: string | null;
  userId?: string | null;
}): Promise<AiExtractedField[]> {
  const limits = await getAiLimits();
  const model = await getAiModel();
  const fields = input.fields ?? (await getMetadataFields());
  const threshold = await confidenceThreshold();

  if (fields.length === 0) {
    throw ApiError.unprocessable(
      'No hay campos de metadatos configurados (system_config.ai_metadata_fields está vacío).',
    );
  }

  const content = (input.text ?? '').trim();
  if (content.length === 0) {
    throw ApiError.unprocessable('El documento no tiene texto extraído para extraer metadatos.');
  }

  const query = fields.map((f) => f.label).join(' ');
  const windows = selectRelevantWindows(content, query, limits.metadata_chars, 3000);
  const contextText = windows.map((w) => `[car. ${w.start}]\n${w.text}`).join('\n\n');

  const fieldList = fields
    .map((f) => `- ${f.key} (${f.label})${f.hint ? `: ${f.hint}` : ''}`)
    .join('\n');

  const result = await generateStructured<MetadataPayload>({
    operation: 'EXTRACT_METADATA',
    model,
    maxTokens: limits.metadata_max_tokens,
    temperature: 0.05,
    schema: METADATA_SCHEMA,
    fingerprint: fingerprintOf('metadata', input.fileName, contextText, fieldList),
    documentId: input.documentId ?? null,
    userId: input.userId ?? null,
    parts: [
      textPart(
        `Eres un archivista que captura metadatos de documentos institucionales colombianos.

ARCHIVO: "${input.fileName}"

CAMPOS A BUSCAR (usa exactamente estas claves):
${fieldList}

CONTENIDO DEL DOCUMENTO (fragmentos con su desplazamiento en el texto):
${contextText}

REGLAS ESTRICTAS:
1. Devuelve únicamente los campos cuyo valor esté REALMENTE en el contenido mostrado. Omite los demás: no inventes ni deduzcas.
2. Copia el valor tal como aparece en el documento. Para fechas usa AAAA-MM-DD si puedes determinarla sin ambigüedad.
3. Usa exclusivamente las claves de la lista; no añadas claves nuevas.
4. Declara la confianza con honestidad entre 0 y 1.`,
      ),
    ],
  });

  const allowed = new Map(fields.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const out: AiExtractedField[] = [];

  for (const item of result.data.campos ?? []) {
    const key = (item?.key ?? '').trim();
    const value = (item?.value ?? '').trim();
    if (!allowed.has(key) || seen.has(key) || value.length === 0) continue;
    seen.add(key);
    const confidence = clampConfidence(item.confidence);
    out.push({ key, value: value.slice(0, 1000), confidence, uncertain: confidence < threshold });
  }

  return out;
}

// ── 4. Reconocimiento óptico con visión ─────────────────────

/**
 * Transcribe el contenido de una imagen o un PDF enviándolo a Gemini como
 * `inline_data`.
 *
 * DECISIÓN DE INGENIERÍA: no se rasteriza el PDF. Rasterizar en Windows sin
 * binarios externos (poppler, ImageMagick) o sin módulos nativos compilados
 * (canvas) no es fiable, así que el PDF completo se envía como `inline_data`
 * con `application/pdf`, formato que Gemini acepta de forma nativa. El límite
 * de páginas (`system_config.ai_ocr_max_pages`) se aplica como instrucción de
 * transcripción, porque la API no admite un rango de páginas.
 *
 * Si el modelo no encuentra texto, devuelve `text: null`: nunca se inventa.
 */
export async function ocrFile(input: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  pageCount?: number | null;
  documentId?: string | null;
  userId?: string | null;
}): Promise<OcrResult> {
  const limits = await getAiLimits();
  const model = await getAiVisionModel();
  const maxPages = await getConfigOr<number>('ai_ocr_max_pages', 30);
  const maxFileMb = await getConfigOr<number>('ai_ocr_max_file_mb', 18);

  const sizeMb = input.buffer.byteLength / (1024 * 1024);
  if (sizeMb > maxFileMb) {
    throw ApiError.unprocessable(
      `El archivo pesa ${sizeMb.toFixed(1)} MB y supera el máximo de ${maxFileMb} MB admitido por el modelo de visión (system_config.ai_ocr_max_file_mb).`,
    );
  }

  const isPdf = input.mimeType === 'application/pdf';
  const pagesProcessed = isPdf
    ? Math.min(maxPages, input.pageCount && input.pageCount > 0 ? input.pageCount : maxPages)
    : 1;

  const instruction = isPdf
    ? `Transcribe el texto de las primeras ${pagesProcessed} páginas de este PDF, en orden.`
    : 'Transcribe todo el texto visible en esta imagen.';

  const result = await generateText({
    operation: 'OCR',
    model,
    maxTokens: limits.ocr_max_tokens,
    temperature: 0,
    fingerprint: fingerprintOf('ocr', input.buffer.toString('base64').slice(0, 200_000), String(pagesProcessed)),
    documentId: input.documentId ?? null,
    userId: input.userId ?? null,
    parts: [
      { inlineData: { mimeType: input.mimeType, data: input.buffer.toString('base64') } },
      textPart(
        `${instruction}

REGLAS:
1. Devuelve ÚNICAMENTE el texto que realmente aparece en el archivo, sin comentarios, sin encabezados añadidos y sin markdown.
2. Conserva el orden de lectura, los saltos de párrafo y el contenido de tablas (una fila por línea, celdas separadas por " | ").
3. No traduzcas, no corrijas y no resumas: transcribe literalmente.
4. Si el archivo no contiene ningún texto legible, responde exactamente: SIN_TEXTO`,
      ),
    ],
  });

  const raw = (result.data ?? '').trim();
  const empty = raw.length === 0 || /^SIN_TEXTO\.?$/i.test(raw);

  return {
    text: empty ? null : raw,
    pages_processed: pagesProcessed,
    page_count: input.pageCount ?? null,
    cached: result.cached,
    usage: result.usage,
  };
}

// ── 5. Ranking semántico sobre contenido ────────────────────

type SemanticPayload = {
  explanation?: string;
  matches?: { document_id: string; reason: string; score: number }[];
};

export async function rankSemantic(
  queryText: string,
  documents: SemanticCandidate[],
  options: { userId?: string | null } = {},
): Promise<{ explanation: string; matches: SemanticMatch[] }> {
  const limits = await getAiLimits();
  const model = await getAiModel();
  const minScore = (await getConfigOr<{ min_score: number }>('ai_semantic', { min_score: 0.2 })).min_score ?? 0.2;

  const docsContext = documents
    .map(
      (d, i) =>
        `[${i + 1}] ID: ${d.id}
    Título: ${d.title}
    Tipo: ${d.type} · Módulo: ${d.module_code}
    Resumen: ${d.summary ?? '(sin resumen)'}
    Fragmento del contenido: ${d.snippet ?? '(sin texto extraído)'}`,
    )
    .join('\n\n');

  const result = await generateStructured<SemanticPayload>({
    operation: 'SEMANTIC',
    model,
    maxTokens: limits.search_max_tokens,
    temperature: 0.2,
    schema: SEMANTIC_SCHEMA,
    fingerprint: fingerprintOf('semantic', queryText, docsContext),
    userId: options.userId ?? null,
    parts: [
      textPart(
        `Asistente de búsqueda documental del Colegio Alemán de Barranquilla.

CONSULTA DEL USUARIO: "${queryText}"

DOCUMENTOS CANDIDATOS:
${docsContext}

INSTRUCCIONES:
1. Selecciona SOLO los documentos que responden realmente a la consulta, apoyándote en el fragmento del contenido, no solo en el título.
2. Usa exclusivamente los identificadores de la lista.
3. Para cada documento elegido explica en una frase por qué responde a la consulta y asígnale una relevancia entre 0 y 1.
4. Si ninguno responde, devuelve una lista vacía y dilo en la explicación. No fuerces resultados.`,
      ),
    ],
  });

  const known = new Set(documents.map((d) => d.id));
  const seen = new Set<string>();
  const matches: SemanticMatch[] = [];

  for (const match of result.data.matches ?? []) {
    const id = (match?.document_id ?? '').trim();
    if (!known.has(id) || seen.has(id)) continue;
    const score = clampConfidence(match.score);
    if (score < minScore) continue;
    seen.add(id);
    matches.push({ document_id: id, reason: (match.reason ?? '').trim(), score });
  }

  return {
    explanation: (result.data.explanation ?? '').trim(),
    matches: matches.sort((a, b) => b.score - a.score),
  };
}

// ── 6. Chat con citas verificables ──────────────────────────

export type ChatHistoryItem = { role: 'user' | 'ai'; text: string };

/**
 * Conversa sobre el documento. El contexto se elige por RELEVANCIA a la
 * pregunta (no cortando por el principio) y al terminar se devuelven citas
 * textuales verificables con su desplazamiento real en `text`.
 */
export async function chatOverDocument(
  doc: { title: string; text: string; id?: string | null },
  question: string,
  history: ChatHistoryItem[],
  onToken: (text: string) => void,
  options: { userId?: string | null } = {},
): Promise<{ sources: Citation[]; usage: TokenUsage }> {
  const limits = await getAiLimits();
  const model = await getAiModel();
  const sourcesCfg = await getConfigOr<AiChatSourcesConfig>('ai_chat_sources', {
    max_sources: 4,
    min_quote_chars: 60,
    max_quote_chars: 400,
  });

  const source = doc.text ?? '';
  const historyText = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.text}`)
    .join('\n');

  const windows: RelevantWindow[] = selectRelevantWindows(
    source,
    `${question} ${historyText}`,
    limits.chat_chars,
    4000,
  );

  const contextText = windows
    .map((w) =>
      w.start === 0 && w.end === source.length
        ? w.text
        : `--- fragmento desde el carácter ${w.start} ---\n${w.text}`,
    )
    .join('\n\n');

  const { usage, fullText } = await streamGenerate(
    {
      operation: 'CHAT',
      model,
      maxTokens: limits.chat_max_tokens,
      temperature: 0.3,
      documentId: doc.id ?? null,
      userId: options.userId ?? null,
      parts: [
        textPart(
          `Eres un asistente documental experto del Colegio Alemán de Barranquilla.
DOCUMENTO: "${doc.title}"

CONTENIDO DEL DOCUMENTO${windows.length > 1 ? ' (fragmentos seleccionados por su relevancia para la pregunta)' : ''}:
${contextText}
${historyText ? `\nCONVERSACIÓN PREVIA:\n${historyText}\n` : ''}
PREGUNTA DEL USUARIO: ${question}

INSTRUCCIONES:
1. Responde ÚNICAMENTE con lo que dice el contenido mostrado arriba.
2. Cuando afirmes algo concreto, reproduce entre comillas la frase EXACTA del documento que lo sustenta.
3. Si la información no aparece en los fragmentos mostrados, dilo con claridad en lugar de suponerla.
4. Responde en texto plano, sin markdown ni asteriscos.`,
        ),
      ],
    },
    onToken,
  );

  let sources: Citation[] = [];
  try {
    sources = deriveCitations(source, fullText, windows, {
      maxSources: sourcesCfg.max_sources ?? 4,
      minQuoteChars: sourcesCfg.min_quote_chars ?? 60,
      maxQuoteChars: sourcesCfg.max_quote_chars ?? 400,
    });
  } catch (error) {
    logger.warn({ err: error }, 'No se pudieron derivar las citas del chat');
  }

  return { sources, usage };
}

export type { AiOperation };
