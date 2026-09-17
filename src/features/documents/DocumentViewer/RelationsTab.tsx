import { useState } from 'react';
import { Link2, Link2Off, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import * as searchApi from '@/api/search';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@/hooks/useQuery';
import { useDialogs } from '@/contexts/DialogContext';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import type { RelationType } from '@/types/api';

export interface RelationsTabProps {
  documentId: string;
  canWrite: boolean;
  onOpenDocument: (id: string) => void;
}

const RELATION_LABELS: Record<RelationType, string> = {
  PARENT_CHILD: 'Padre-Hijo',
  BIDIRECTIONAL: 'Relacionado',
  STAPLED: 'Grapado virtual',
};

export function RelationsTab({
  documentId,
  canWrite,
  onOpenDocument,
}: RelationsTabProps): React.JSX.Element {
  const { statusLabel, statusColor, moduleLabel } = useCatalogs();
  const { confirm } = useDialogs();
  const relations = useQuery(`document:${documentId}:relations`, () =>
    documentsApi.listRelations(documentId),
  );

  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [relationType, setRelationType] = useState<RelationType>('BIDIRECTIONAL');

  const results = useQuery(
    debounced.trim().length >= 2 ? `search:fulltext:relations:${debounced}` : null,
    (signal) => searchApi.fulltext({ q: debounced.trim(), pageSize: 8 }, signal),
  );

  const add = async (targetId: string): Promise<void> => {
    try {
      const relation = await documentsApi.addRelation(documentId, targetId, relationType);
      relations.setData([...(relations.data ?? []), relation]);
      setTerm('');
      toast.success('Relación creada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la relación.');
    }
  };

  const remove = async (relationId: string): Promise<void> => {
    const ok = await confirm({
      title: 'Quitar relación',
      message: 'El vínculo entre ambos documentos se eliminará.',
      tone: 'danger',
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await documentsApi.deleteRelation(documentId, relationId);
      relations.setData((relations.data ?? []).filter((relation) => relation.id !== relationId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar la relación.');
    }
  };

  if (relations.error) {
    return <ApiErrorState error={relations.error} onRetry={() => void relations.refetch()} />;
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <section className="rounded-card border border-line bg-surface-sunken p-3">
          <h3 className="mb-2 font-display text-sm text-content-primary">Relacionar con otro documento</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[200px] flex-1"
              placeholder="Buscar por título, folio o contenido…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              icon={<Search className="h-4 w-4" />}
              aria-label="Buscar documento para relacionar"
            />
            <Select
              className="w-48"
              aria-label="Tipo de relación"
              value={relationType}
              onChange={(e) => setRelationType(e.target.value as RelationType)}
              options={(Object.keys(RELATION_LABELS) as RelationType[]).map((key) => ({
                value: key,
                label: RELATION_LABELS[key],
              }))}
            />
          </div>

          {results.loading && <Skeleton className="mt-2 h-20 w-full" />}
          {results.data && results.data.data.length > 0 && (
            <ul className="mt-2 space-y-1">
              {results.data.data
                .filter((doc) => doc.id !== documentId)
                .map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => void add(doc.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-acid-border"
                    >
                      <Link2 className="h-3.5 w-3.5 flex-shrink-0 text-content-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-content-secondary">
                        {doc.title}
                      </span>
                      <Badge>{moduleLabel(doc.module_code)}</Badge>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {results.data && results.data.data.length === 0 && debounced.trim().length >= 2 && (
            <p className="mt-2 text-xs text-content-muted">Sin coincidencias.</p>
          )}
        </section>
      )}

      {relations.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (relations.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Link2Off className="h-8 w-8" />}
          title="Sin relaciones"
          description="Este documento no está vinculado con otros."
        />
      ) : (
        <ul className="space-y-2">
          {(relations.data ?? []).map((relation) => (
            <li
              key={relation.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3"
            >
              <Link2 className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
              <button
                type="button"
                onClick={() => onOpenDocument(relation.target_document.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm text-content-primary hover:text-acid">
                  {relation.target_document.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
                  <Badge>{RELATION_LABELS[relation.relation_type]}</Badge>
                  <Badge color={statusColor(relation.target_document.status_code)}>
                    {statusLabel(relation.target_document.status_code)}
                  </Badge>
                  <span>{moduleLabel(relation.target_document.module_code)}</span>
                </p>
              </button>
              {canWrite && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Quitar relación"
                  onClick={() => void remove(relation.id)}
                  icon={<Link2Off className="h-4 w-4" />}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
