import { useState } from 'react';
import { EyeOff, Sparkles } from 'lucide-react';
import * as aiApi from '@/api/ai';
import { ApiError } from '@/api/client';
import { AiSuggestionList } from '@/components/ai/AiSuggestionList';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import type { AiClassification } from '@/types/api';

/**
 * Tope de bytes que el navegador lee del archivo para la muestra de texto.
 * No es un límite de negocio: el servidor recorta según `ai_limits`. Solo
 * evita mandar un archivo entero por el cuerpo de la petición.
 */
const SAMPLE_BYTES = 200_000;

/** Tipos que el navegador puede decodificar como texto sin librerías. */
const TEXTUAL_TYPES = ['application/json', 'application/xml', 'application/x-yaml'];
const TEXTUAL_EXTENSIONS = ['.txt', '.csv', '.md', '.json', '.xml', '.log', '.tsv'];

export function isTextualFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('text/')) return true;
  if (TEXTUAL_TYPES.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return TEXTUAL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Muestra de texto del archivo. Para formatos binarios (PDF escaneado, Word,
 * imágenes) el navegador no puede extraer texto sin librerías: se manda cadena
 * vacía y la interfaz avisa de que la propuesta se basa solo en el nombre.
 */
export async function readTextSample(file: File): Promise<string> {
  if (!isTextualFile(file)) return '';
  try {
    const slice = file.slice(0, SAMPLE_BYTES);
    // `Blob.text()` no existe en todos los entornos (Safari antiguo, jsdom):
    // se cae a FileReader, que sí está en todas partes.
    const text =
      typeof slice.text === 'function'
        ? await slice.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error);
            reader.readAsText(slice);
          });
    return text.trim();
  } catch {
    return '';
  }
}

export interface AiClassificationPanelProps {
  moduleCode: string;
  file: File;
  /** Valores confirmados hoy en el formulario de este archivo. */
  value: { type: string; category: string; subcategory: string };
  /** Catálogo real del servidor: TRD del módulo y series/subseries. */
  typeValues: string[];
  serieValues: string[];
  subserieValues: string[];
  onAccept: (field: 'type' | 'category' | 'subcategory', value: string) => void;
  threshold: number | null;
  disabled?: boolean;
}

/**
 * Sugerencia de clasificación TRD para un archivo del asistente de carga
 * (`POST /ai/classify` en su forma `{ module_code, file_name, text }`).
 *
 * La IA nunca rellena el formulario: propone, la persona confirma con un clic
 * y puede descartar todas las propuestas y clasificar a mano.
 */
export function AiClassificationPanel({
  moduleCode,
  file,
  value,
  typeValues,
  serieValues,
  subserieValues,
  onAccept,
  threshold,
  disabled = false,
}: AiClassificationPanelProps): React.JSX.Element {
  const [result, setResult] = useState<AiClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const request = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setDismissed(false);
    try {
      const text = await readTextSample(file);
      setResult(
        await aiApi.classify({ module_code: moduleCode, file_name: file.name, text }),
      );
    } catch (err) {
      setResult(null);
      setError(
        err instanceof ApiError
          ? err
          : new ApiError('INTERNAL', 'No se pudo obtener la sugerencia de clasificación.', 0),
      );
    } finally {
      setLoading(false);
    }
  };

  const visible = result !== null && !dismissed;
  // El servidor exige una muestra de texto para sugerir antes de guardar: si el
  // navegador no puede leer el formato, no se manda una petición condenada.
  const readable = isTextualFile(file);

  return (
    <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-overlay/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-secondary">
          {visible
            ? 'Propuestas de la IA. Nada se aplica hasta que las confirmes.'
            : readable
              ? 'La IA puede proponer tipo documental, serie y subserie para este archivo.'
              : 'Este formato no se puede leer en el navegador, así que aquí no hay sugerencia. Tras subirlo, el servidor extrae su texto y podrás pedirla desde el documento.'}
        </p>
        <div className="flex gap-2">
          {visible && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              icon={<EyeOff className="h-3.5 w-3.5" />}
            >
              Ignorar sugerencias
            </Button>
          )}
          {readable && (
            <Button
              size="sm"
              variant="outline"
              loading={loading}
              disabled={disabled}
              onClick={() => void request()}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              {result ? 'Volver a sugerir' : 'Sugerir con IA'}
            </Button>
          )}
        </div>
      </div>

      {error && <ApiErrorState className="mt-3" error={error} onRetry={() => void request()} />}

      {visible && result && (
        <div className="mt-3 space-y-2">
          <AiSuggestionList
            fieldLabel="Tipo documental (TRD)"
            suggestions={result.document_type}
            value={value.type}
            knownValues={typeValues}
            threshold={threshold}
            disabled={disabled}
            onAccept={(next) => onAccept('type', next)}
          />
          <AiSuggestionList
            fieldLabel="Serie"
            suggestions={result.serie}
            value={value.category}
            knownValues={serieValues}
            threshold={threshold}
            disabled={disabled}
            onAccept={(next) => onAccept('category', next)}
          />
          <AiSuggestionList
            fieldLabel="Subserie"
            suggestions={result.subserie}
            value={value.subcategory}
            knownValues={subserieValues}
            threshold={threshold}
            disabled={disabled}
            onAccept={(next) => onAccept('subcategory', next)}
          />

          {result.module_code && (
            <p className="rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-[11px] text-state-warning">
              El contenido parece corresponder a otra dependencia
              {` (${result.module_code.value})`}: {result.module_code.reason} Cierra el asistente y vuelve a
              cargarlo desde esa dependencia si estás de acuerdo.
            </p>
          )}
        </div>
      )}

      {dismissed && (
        <p className="mt-2 text-[11px] text-content-muted">
          Sugerencias descartadas. Clasifica a mano con los campos de arriba.
        </p>
      )}
    </div>
  );
}
