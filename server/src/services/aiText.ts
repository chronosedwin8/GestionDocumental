/**
 * Utilidades de texto del motor de IA: troceado con solapamiento,
 * selección de contexto por relevancia, normalización del vocabulario
 * de etiquetas y localización verificable de citas.
 *
 * Todo es determinista y no llama al modelo.
 */

export type TextChunk = { index: number; start: number; end: number; text: string };

const STOPWORDS = new Set([
  'a', 'al', 'ante', 'con', 'contra', 'de', 'del', 'desde', 'donde', 'el', 'ella', 'ellas', 'ellos',
  'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso', 'esta', 'estan', 'este', 'esto', 'estos', 'fue',
  'ha', 'han', 'hasta', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mi', 'muy', 'no',
  'nos', 'o', 'para', 'pero', 'por', 'que', 'se', 'segun', 'ser', 'si', 'sin', 'sobre', 'son', 'su',
  'sus', 'tambien', 'te', 'tiene', 'todo', 'todos', 'tras', 'un', 'una', 'uno', 'unos', 'y', 'ya',
  'documento', 'documentos', 'archivo', 'archivos',
]);

/** Quita tildes y diacríticos (para comparar, nunca para mostrar). */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Trocea el texto en bloques del tamaño indicado con solapamiento, cortando
 * en un límite de párrafo o frase cuando es posible para no partir ideas.
 */
export function chunkText(
  text: string,
  size: number,
  overlap: number,
  maxChunks: number,
): TextChunk[] {
  const source = text ?? '';
  const chunkSize = Math.max(500, Math.floor(size));
  const step = Math.max(200, chunkSize - Math.max(0, Math.floor(overlap)));
  const chunks: TextChunk[] = [];

  if (source.length === 0) return chunks;

  let cursor = 0;
  while (cursor < source.length && chunks.length < Math.max(1, maxChunks)) {
    let end = Math.min(source.length, cursor + chunkSize);

    if (end < source.length) {
      const tail = source.slice(Math.max(cursor, end - 400), end);
      const breakAt = Math.max(tail.lastIndexOf('\n\n'), tail.lastIndexOf('. '), tail.lastIndexOf('\n'));
      if (breakAt > 100) end = Math.max(cursor, end - 400) + breakAt + 1;
    }

    chunks.push({ index: chunks.length, start: cursor, end, text: source.slice(cursor, end) });
    if (end >= source.length) break;
    cursor = Math.max(cursor + step, end - Math.max(0, Math.floor(overlap)));
  }

  return chunks;
}

/** Cuántos caracteres del documento abarca un troceado (para informes honestos). */
export function coveredChars(chunks: TextChunk[]): number {
  if (chunks.length === 0) return 0;
  return chunks[chunks.length - 1].end;
}

// ── Relevancia léxica determinista ──────────────────────────

export function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      deaccent(query.toLowerCase())
        .split(/[^a-z0-9ñ]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

/** Puntúa un fragmento por cobertura y frecuencia de los términos de la consulta. */
export function scoreFragment(fragment: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = deaccent(fragment.toLowerCase());
  let covered = 0;
  let occurrences = 0;
  for (const token of tokens) {
    let from = 0;
    let found = 0;
    for (;;) {
      const at = haystack.indexOf(token, from);
      if (at === -1) break;
      found += 1;
      from = at + token.length;
      if (found > 8) break;
    }
    if (found > 0) covered += 1;
    occurrences += found;
  }
  const coverage = covered / tokens.length;
  const density = Math.min(1, occurrences / (tokens.length * 3));
  return Math.round((coverage * 0.75 + density * 0.25) * 1000) / 1000;
}

export type RelevantWindow = { start: number; end: number; text: string; score: number };

/**
 * Selecciona las ventanas del texto más relevantes para una consulta hasta
 * agotar el presupuesto de caracteres. Sustituye al recorte "desde el principio".
 * Si ningún término coincide, devuelve el principio y el final del documento,
 * que es donde suelen estar el objeto y las firmas.
 */
export function selectRelevantWindows(
  text: string,
  query: string,
  budgetChars: number,
  windowSize = 3000,
): RelevantWindow[] {
  const source = text ?? '';
  if (source.length === 0) return [];
  if (source.length <= budgetChars) {
    return [{ start: 0, end: source.length, text: source, score: 1 }];
  }

  const tokens = queryTokens(query);
  const size = Math.max(800, Math.min(windowSize, budgetChars));
  const stride = Math.max(400, Math.floor(size / 2));
  const scored: RelevantWindow[] = [];

  for (let start = 0; start < source.length; start += stride) {
    const end = Math.min(source.length, start + size);
    const fragment = source.slice(start, end);
    scored.push({ start, end, text: fragment, score: scoreFragment(fragment, tokens) });
    if (end >= source.length) break;
  }

  const positives = scored.filter((w) => w.score > 0).sort((a, b) => b.score - a.score);

  const picked: RelevantWindow[] = [];
  let used = 0;
  for (const window of positives) {
    if (used + window.text.length > budgetChars) continue;
    picked.push(window);
    used += window.text.length;
    if (used >= budgetChars) break;
  }

  if (picked.length === 0) {
    // Sin coincidencias léxicas: principio y final explícitos (no un recorte ciego).
    const half = Math.floor(budgetChars / 2);
    picked.push({ start: 0, end: half, text: source.slice(0, half), score: 0 });
    const tailStart = Math.max(half, source.length - half);
    picked.push({
      start: tailStart,
      end: source.length,
      text: source.slice(tailStart),
      score: 0,
    });
  }

  return picked.sort((a, b) => a.start - b.start);
}

/** Fragmento textual real alrededor de la primera coincidencia de la consulta. */
export function snippetFor(text: string, query: string, maxChars: number): string | null {
  const source = (text ?? '').trim();
  if (source.length === 0) return null;
  const tokens = queryTokens(query);
  const haystack = deaccent(source.toLowerCase());

  let best = -1;
  for (const token of tokens) {
    const at = haystack.indexOf(token);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }

  if (best === -1) return source.slice(0, maxChars).trim();

  const start = Math.max(0, best - Math.floor(maxChars / 3));
  const end = Math.min(source.length, start + maxChars);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}

// ── Vocabulario controlado de etiquetas ─────────────────────

/** Forma visible de la etiqueta: minúsculas conservando la tilde, sin ruido. */
export function normalizeTag(tag: string): string {
  return (tag ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^[\s\d.\-*"'[\]]+|[\s"'*[\].]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Clave de comparación: sin tildes y con el plural evidente reducido,
 * de modo que "Nómina", "nomina" y "nóminas" sean la misma etiqueta.
 */
export function tagKey(tag: string): string {
  const base = deaccent(normalizeTag(tag)).replace(/[^a-z0-9ñ ]/g, '');
  return base
    .split(' ')
    .map((word) => {
      if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
      if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
      return word;
    })
    .join(' ')
    .trim();
}

/**
 * Consolida etiquetas nuevas contra el vocabulario existente: si la clave
 * coincide con una etiqueta ya usada en el módulo, se conserva la grafía
 * existente en lugar de crear una variante.
 */
export function consolidateTags(
  proposed: string[],
  existing: string[],
  max: number,
  minLength = 2,
  maxLength = 40,
): string[] {
  const canonical = new Map<string, string>();
  for (const tag of existing) {
    const key = tagKey(tag);
    if (key && !canonical.has(key)) canonical.set(key, normalizeTag(tag));
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of proposed) {
    const normalized = normalizeTag(raw);
    if (normalized.length < minLength || normalized.length > maxLength) continue;
    const key = tagKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(canonical.get(key) ?? normalized);
    if (result.length >= max) break;
  }

  return result;
}

// ── Citas verificables ──────────────────────────────────────

export type Citation = { quote: string; offset: number };

function collapse(value: string): string {
  return deaccent(value.toLowerCase()).replace(/\s+/g, ' ').trim();
}

/**
 * Localiza una cita en el texto original tolerando diferencias de espacios,
 * mayúsculas y tildes. Devuelve el desplazamiento REAL en `text` y el texto
 * tal como aparece en el documento, o `null` si la cita no está: nunca se
 * devuelve una cita que no se pueda verificar.
 */
export function locateQuote(text: string, quote: string): Citation | null {
  const needle = collapse(quote);
  if (needle.length < 12) return null;

  // Mapa posición-colapsada → posición-original.
  const map: number[] = [];
  let collapsed = '';
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = deaccent(text[i].toLowerCase());
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      collapsed += ' ';
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    collapsed += ch;
    map.push(i);
    lastWasSpace = false;
  }

  const at = collapsed.indexOf(needle);
  if (at === -1) return null;

  const start = map[at] ?? 0;
  const endIndex = Math.min(map.length - 1, at + needle.length - 1);
  const end = (map[endIndex] ?? start) + 1;
  return { quote: text.slice(start, end).trim(), offset: start };
}

/**
 * Deriva citas verificables de una respuesta: primero los entrecomillados que
 * existan literalmente en el documento; si no hay, las ventanas de contexto
 * enviadas al modelo que más se parezcan a la respuesta.
 */
export function deriveCitations(
  documentText: string,
  answer: string,
  contextWindows: RelevantWindow[],
  options: { maxSources: number; minQuoteChars: number; maxQuoteChars: number },
): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<number>();

  const quoted = answer.match(/[«"“]([^»"”]{20,400})[»"”]/g) ?? [];
  for (const raw of quoted) {
    const inner = raw.slice(1, -1).trim();
    const found = locateQuote(documentText, inner);
    if (!found || seen.has(found.offset)) continue;
    seen.add(found.offset);
    citations.push({ quote: found.quote.slice(0, options.maxQuoteChars), offset: found.offset });
    if (citations.length >= options.maxSources) return citations;
  }

  const answerTokens = queryTokens(answer);
  const ranked = contextWindows
    .map((w) => ({ window: w, score: scoreFragment(w.text, answerTokens) }))
    .filter((w) => w.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { window } of ranked) {
    const snippet = window.text.trim().slice(0, options.maxQuoteChars);
    if (snippet.length < options.minQuoteChars) continue;
    const offset = window.start + window.text.indexOf(snippet.slice(0, 40));
    if (seen.has(offset)) continue;
    seen.add(offset);
    citations.push({ quote: snippet, offset: Math.max(0, offset) });
    if (citations.length >= options.maxSources) break;
  }

  return citations;
}
