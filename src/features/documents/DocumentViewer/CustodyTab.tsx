import { ShieldCheck } from 'lucide-react';
import * as documentsApi from '@/api/documents';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';

export interface CustodyTabProps {
  documentId: string;
}

/** Cadena de custodia — visible sólo para roles con acceso total. */
export function CustodyTab({ documentId }: CustodyTabProps): React.JSX.Element {
  const custody = useQuery(`document:${documentId}:custody`, () => documentsApi.listCustody(documentId));

  if (custody.error) return <ApiErrorState error={custody.error} onRetry={() => void custody.refetch()} />;
  if (custody.loading) return <Skeleton className="h-40 w-full" />;

  const events = custody.data ?? [];

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title="Sin eventos de custodia"
        description="Todavía no hay registros de acceso o transferencia para este documento."
      />
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-line pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-raised bg-acid"
            aria-hidden
          />
          <p className="font-mono text-xs font-medium text-content-primary">{event.event_type}</p>
          <p className="text-[11px] text-content-muted">
            {event.actor_email ?? 'Sistema'}
            {event.actor_role && ` · ${event.actor_role}`} · {formatDateTime(event.created_at)}
          </p>
          {event.event_details && Object.keys(event.event_details).length > 0 && (
            <pre className="mt-1 overflow-x-auto rounded-md border border-line bg-surface-sunken p-2 text-[10px] text-content-secondary">
              {JSON.stringify(event.event_details, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
