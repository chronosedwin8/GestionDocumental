import { useState } from 'react';
import { Check, Plus, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as aiApi from '@/api/ai';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useAiConfidenceThreshold } from '@/hooks/useAiHealth';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { formatConfidence, isUncertain } from '@/lib/ai';
import type { AiExtractedField, ApiDocument, DocumentMetadataEntry } from '@/types/api';

export interface MetadataTabProps {
  document: ApiDocument;
  canWrite: boolean;
  onUpdated: (document: ApiDocument) => void;
  /** Vuelve a pedir el documento (no lo necesita el flujo normal). */
  onRefresh?: () => void;
}

/**
 * Metadatos persistidos en el servidor, con su procedencia siempre a la vista:
 * lo extraído por la IA lleva su porcentaje de confianza y lo escrito por una
 * persona se marca como tal.
 *
 * La extracción se pide con `persist: false`: la IA **propone** y nada se
 * guarda hasta que alguien lo confirma. Reemplazar un valor humano exige una
 * confirmación explícita.
 */
export function MetadataTab({
  document,
  canWrite,
  onUpdated,
  onRefresh,
}: MetadataTabProps): React.JSX.Element {
  const { settings } = useCatalogs();
  const { confirm } = useDialogs();
  const threshold = useAiConfidenceThreshold();

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [proposals, setProposals] = useState<AiExtractedField[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [aiError, setAiError] = useState<ApiError | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const apply = (metadata: DocumentMetadataEntry[]): void => {
    onUpdated({ ...document, metadata });
  };

  const existing = (metadataKey: string): DocumentMetadataEntry | undefined =>
    document.metadata.find((entry) => entry.key === metadataKey);

  const add = async (): Promise<void> => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    setSaving(true);
    try {
      apply(await documentsApi.upsertMetadata(document.id, trimmedKey, value.trim()));
      setKey('');
      setValue('');
      toast.success('Metadato guardado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el metadato.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (metadataKey: string): Promise<void> => {
    try {
      apply(await documentsApi.deleteMetadata(document.id, metadataKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el metadato.');
    }
  };

  /* --------------------------------------------------------- extracción */

  const extract = async (): Promise<void> => {
    setExtracting(true);
    setAiError(null);
    try {
      // `persist: false`: los campos se muestran como propuesta, no se guardan.
      const result = await aiApi.extractMetadata({ document_id: document.id, persist: false });
      setProposals(result.fields);
      if (result.fields.length === 0) toast('La IA no encontró metadatos en este documento.');
    } catch (err) {
      setProposals(null);
      setAiError(
        err instanceof ApiError
          ? err
          : new ApiError('INTERNAL', 'No se pudieron extraer los metadatos.', 0),
      );
    } finally {
      setExtracting(false);
    }
  };

  /** Guarda una propuesta conservando su procedencia (`is_extracted = true`). */
  const accept = async (field: AiExtractedField): Promise<void> => {
    const current = existing(field.key);
    if (current && !current.is_extracted && current.value !== field.value) {
      const ok = await confirm({
        title: 'Reemplazar un valor escrito por una persona',
        message: `"${field.key}" tiene el valor «${current.value ?? '—'}» registrado por una persona. La propuesta de la IA es «${field.value}». ¿Quieres reemplazarlo?`,
        confirmLabel: 'Reemplazar',
        tone: 'danger',
      });
      if (!ok) return;
    }

    setSavingKey(field.key);
    try {
      apply(
        await documentsApi.upsertMetadata(document.id, field.key, field.value, {
          is_extracted: true,
          confidence: field.confidence,
        }),
      );
      setProposals((prev) => (prev ?? []).filter((entry) => entry.key !== field.key));
      toast.success(`"${field.key}" guardado.`);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el metadato.');
    } finally {
      setSavingKey(null);
    }
  };

  /** Guarda solo lo que no pisa un valor humano; el resto queda para revisión. */
  const acceptAllSafe = async (): Promise<void> => {
    const safe = (proposals ?? []).filter((field) => {
      const current = existing(field.key);
      return !current || current.is_extracted || current.value === field.value;
    });
    for (const field of safe) {
      await accept(field);
    }
  };

  const collisions = (proposals ?? []).filter((field) => {
    const current = existing(field.key);
    return current !== undefined && !current.is_extracted && current.value !== field.value;
  }).length;

  const safeCount = (proposals ?? []).length - collisions;

  return (
    <div className="space-y-4">
      {document.metadata.length === 0 ? (
        <EmptyState
          title="Sin metadatos"
          description="Aún no se han extraído ni registrado metadatos para este documento."
        />
      ) : (
        <ul className="space-y-2">
          {document.metadata.map((entry) => (
            <li
              key={entry.key}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-content-primary">
                  {entry.key}
                  {entry.is_extracted ? (
                    <Badge color="var(--color-info)">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Extraído por IA
                      {entry.confidence !== null && ` ${Math.round(entry.confidence * 100)}%`}
                    </Badge>
                  ) : (
                    <Badge>
                      <UserRound className="h-3 w-3" aria-hidden />
                      Escrito por una persona
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 break-words text-sm text-content-secondary">{entry.value ?? '—'}</p>
              </div>
              {canWrite && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Eliminar metadato ${entry.key}`}
                  onClick={() => void remove(entry.key)}
                  icon={<Trash2 className="h-4 w-4" />}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------- extracción con IA */}
      {canWrite && settings?.ai_enabled !== false && (
        <div className="rounded-card border border-dashed border-line bg-surface-overlay/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-content-secondary">
              La IA puede proponer fechas, partes, valores e identificadores del documento. Nada se guarda
              hasta que lo confirmes.
            </p>
            <Button
              size="sm"
              variant="outline"
              loading={extracting}
              onClick={() => void extract()}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              {proposals ? 'Volver a extraer' : 'Extraer metadatos con IA'}
            </Button>
          </div>

          {aiError && <ApiErrorState className="mt-3" error={aiError} onRetry={() => void extract()} />}

          {proposals && proposals.length === 0 && !extracting && (
            <p className="mt-3 text-xs text-content-muted">
              La IA no propuso ningún metadato para este documento.
            </p>
          )}

          {proposals && proposals.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-content-secondary">
                  Propuestas sin guardar ({proposals.length})
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProposals(null)}
                    icon={<X className="h-3.5 w-3.5" />}
                  >
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={safeCount === 0 || savingKey !== null}
                    onClick={() => void acceptAllSafe()}
                    icon={<Check className="h-3.5 w-3.5" />}
                  >
                    Guardar {safeCount} sin conflicto
                  </Button>
                </div>
              </div>

              {collisions > 0 && (
                <p className="rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-[11px] text-state-warning">
                  {collisions} propuesta(s) chocan con un valor escrito por una persona. Se muestran los dos
                  valores y solo se reemplazan si lo confirmas una a una.
                </p>
              )}

              <ul className="space-y-2">
                {proposals.map((field) => {
                  const current = existing(field.key);
                  const human = current !== undefined && !current.is_extracted;
                  const conflict = human && current.value !== field.value;
                  const confidence = formatConfidence(field.confidence);
                  const uncertain = isUncertain(field.confidence, threshold, field.uncertain);

                  return (
                    <li
                      key={field.key}
                      className="rounded-lg border border-line bg-surface-sunken px-3 py-2"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-content-primary">
                        {field.key}
                        <Badge color="var(--color-info)">
                          <Sparkles className="h-3 w-3" aria-hidden />
                          Propuesto por IA
                        </Badge>
                        {confidence && (
                          <Badge color={uncertain ? 'var(--color-warning)' : undefined}>
                            Confianza {confidence}
                          </Badge>
                        )}
                        {uncertain && <Badge color="var(--color-warning)">Incierta</Badge>}
                      </p>

                      <p className="mt-1 break-words text-sm text-content-secondary">{field.value}</p>

                      {current && (
                        <p className="mt-1 break-words text-[11px] text-content-muted">
                          Valor actual
                          {human ? ' (escrito por una persona)' : ' (extraído por IA)'}: «
                          {current.value ?? '—'}»
                        </p>
                      )}

                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant={conflict ? 'danger' : 'outline'}
                          loading={savingKey === field.key}
                          onClick={() => void accept(field)}
                          icon={<Check className="h-3.5 w-3.5" />}
                        >
                          {conflict ? 'Reemplazar el valor humano' : 'Guardar este metadato'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <div className="rounded-card border border-line bg-surface-sunken p-3">
          <p className="mb-2 text-xs font-medium text-content-secondary">Añadir metadato</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Clave" required>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ej. Número de contrato" />
            </FormField>
            <FormField label="Valor">
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
          </div>
          <Button
            className="mt-3"
            size="sm"
            variant="primary"
            loading={saving}
            disabled={key.trim() === ''}
            onClick={() => void add()}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Guardar metadato
          </Button>
        </div>
      )}
    </div>
  );
}
