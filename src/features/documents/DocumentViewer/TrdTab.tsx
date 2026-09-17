import { useState } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, relativeDays } from '@/lib/format';
import type { ApiDocument } from '@/types/api';

export interface TrdTabProps {
  document: ApiDocument;
  canWrite: boolean;
  onUpdated: (document: ApiDocument) => void;
}

export function TrdTab({ document, canWrite, onUpdated }: TrdTabProps): React.JSX.Element {
  const { dispositionLabel, dispositionColor, disposition } = useCatalogs();
  const trd = useQuery(`document:${document.id}:trd`, () => documentsApi.getDocumentTrd(document.id));
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  if (trd.loading) return <Skeleton className="h-40 w-full" />;
  if (trd.error) return <ApiErrorState error={trd.error} onRetry={() => void trd.refetch()} />;
  if (!trd.data) return <EmptyState title="Sin información de retención" />;

  const { rule, candidates, retention_end_date: retentionEnd } = trd.data;

  const apply = async (): Promise<void> => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await documentsApi.setDocumentTrd(document.id, selected);
      onUpdated(updated);
      await trd.refetch();
      toast.success('Clasificación TRD aplicada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aplicar la TRD.');
    } finally {
      setSaving(false);
    }
  };

  const dispositionAction = rule ? disposition(rule.disposition_code)?.action : undefined;

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 font-display text-sm text-content-primary">Regla aplicada</h3>
        {rule ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Tipo documental</dt>
              <dd className="text-sm text-content-secondary">{rule.document_type}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Retención</dt>
              <dd className="text-sm text-content-secondary">{rule.retention_years} año(s)</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Disposición final</dt>
              <dd>
                <Badge color={dispositionColor(rule.disposition_code)}>
                  {dispositionLabel(rule.disposition_code)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Vence</dt>
              <dd className="inline-flex items-center gap-1.5 text-sm text-content-secondary">
                <CalendarClock className="h-3.5 w-3.5 text-content-muted" aria-hidden />
                {formatDate(retentionEnd)}
                {retentionEnd && (
                  <span className="text-[11px] text-content-muted">({relativeDays(retentionEnd)})</span>
                )}
              </dd>
            </div>
            {rule.description && (
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-content-muted">Descripción</dt>
                <dd className="text-sm text-content-secondary">{rule.description}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-content-muted">
            Este documento no tiene una regla de retención asociada. Selecciona un tipo documental para
            aplicarla.
          </p>
        )}

        {dispositionAction === 'DELETE' && (
          <p className="mt-3 rounded-lg border border-state-warning/40 bg-state-warning/10 p-2.5 text-xs text-state-warning">
            Al vencer la retención, este documento es candidato a eliminación con acta.
          </p>
        )}
      </section>

      {canWrite && (
        <section className="rounded-card border border-line bg-surface-sunken p-4">
          <h3 className="mb-3 font-display text-sm text-content-primary">Reclasificar</h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-content-muted">
              No hay tipos documentales configurados en la TRD para esta dependencia.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Tipo documental" className="min-w-[240px] flex-1">
                <Select
                  placeholder="Selecciona…"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  options={candidates.map((candidate) => ({
                    value: candidate.document_type,
                    label: `${candidate.document_type} · ${candidate.retention_years} año(s) · ${dispositionLabel(candidate.disposition_code)}`,
                  }))}
                />
              </FormField>
              <Button
                variant="primary"
                loading={saving}
                disabled={!selected}
                onClick={() => void apply()}
                icon={<Save className="h-4 w-4" />}
              >
                Aplicar
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
