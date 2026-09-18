/**
 * Utilidades compartidas de la capa de IA.
 *
 * La confianza la declara el modelo y se muestra tal cual (decisión 6 del
 * análisis). El umbral por debajo del cual una propuesta se marca como
 * incierta lo publica el servidor: si no llega ninguno, **no se inventa** y
 * la interfaz se limita a mostrar el porcentaje.
 */

/** `0.82` → `"82 %"`. Devuelve `null` si la confianza no es un número válido. */
export function formatConfidence(confidence: number | null | undefined): string | null {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null;
  const clamped = Math.max(0, Math.min(1, confidence));
  return `${Math.round(clamped * 100)} %`;
}

/**
 * Decide si una propuesta se muestra como incierta.
 *
 * Manda la marca `uncertain` del servidor, que la calcula con su
 * `ai_confidence_threshold`. Si no viene, se usa el umbral que publique el
 * servidor por otra vía; sin umbral no hay juicio y la propuesta no se marca.
 */
export function isUncertain(
  confidence: number | null | undefined,
  threshold: number | null | undefined,
  serverFlag?: boolean,
): boolean {
  if (typeof serverFlag === 'boolean') return serverFlag;
  if (typeof threshold !== 'number' || Number.isNaN(threshold)) return false;
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return false;
  return confidence < threshold;
}

/** Etiqueta en español de cada operación de `GET /ai/usage`. */
const OPERATION_LABELS: Record<string, string> = {
  ANALYZE: 'Resumen y etiquetas',
  CLASSIFY: 'Clasificación',
  EXTRACT_METADATA: 'Extracción de metadatos',
  OCR: 'Reconocimiento óptico',
  SEMANTIC: 'Búsqueda semántica',
  CHAT: 'Chat sobre el documento',
};

/** Traduce la operación; si el servidor añade una nueva, muestra su código. */
export function operationLabel(operation: string): string {
  return OPERATION_LABELS[operation] ?? operation;
}
