import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import type { ApiDocument, DocumentMetadataEntry } from '@/types/api';

export interface MetadataTabProps {
  document: ApiDocument;
  canWrite: boolean;
  onUpdated: (document: ApiDocument) => void;
}

/** Metadatos persistidos en el servidor (antes sólo vivían en estado local). */
export function MetadataTab({ document, canWrite, onUpdated }: MetadataTabProps): React.JSX.Element {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = (metadata: DocumentMetadataEntry[]): void => {
    onUpdated({ ...document, metadata });
  };

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
                <p className="flex items-center gap-2 text-xs font-medium text-content-primary">
                  {entry.key}
                  {entry.is_extracted && (
                    <Badge color="var(--color-info)">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Extraído
                      {entry.confidence !== null && ` ${Math.round(entry.confidence * 100)}%`}
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
