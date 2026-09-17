import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, FileText, Star } from 'lucide-react';
import * as meApi from '@/api/me';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { useCatalogs } from '@/contexts/CatalogContext';
import { formatDateTime } from '@/lib/format';
import type { DocumentSummary } from '@/types/api';

type TabId = 'favoritos' | 'recientes';

function DocumentList({
  documents,
  emptyText,
  timestamp,
}: {
  documents: DocumentSummary[];
  emptyText: string;
  timestamp?: (doc: DocumentSummary) => string | undefined;
}): React.JSX.Element {
  const { moduleColor, moduleLabel } = useCatalogs();

  if (documents.length === 0) {
    return <p className="py-4 text-sm text-content-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {documents.slice(0, 8).map((doc) => (
        <li key={doc.id}>
          <Link
            to={`/documentos/${doc.id}`}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-sunken px-3 py-2 no-underline transition-colors hover:border-acid-border hover:no-underline"
          >
            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-content-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-content-primary">{doc.title}</span>
              {timestamp?.(doc) && (
                <span className="block truncate text-[10px] text-content-muted">{timestamp(doc)}</span>
              )}
            </span>
            <Badge color={moduleColor(doc.module_code)}>{moduleLabel(doc.module_code)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Favoritos y últimos documentos vistos del usuario (U2). */
export function QuickAccess(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('favoritos');
  const bookmarks = useBookmarks();
  const recent = useQuery('me:recent', (signal) => meApi.listRecent(signal), { staleTime: 30_000 });

  const loading = tab === 'favoritos' ? bookmarks.loading : recent.loading;
  const error = tab === 'favoritos' ? bookmarks.error : recent.error;

  return (
    <section className="panel" aria-labelledby="acceso-rapido-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="acceso-rapido-title"
          className="flex items-center gap-2 font-display text-base text-content-primary"
        >
          <Star className="h-4 w-4 text-acid" aria-hidden />
          Acceso rápido
        </h2>
        <Tabs
          ariaLabel="Favoritos o recientes"
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          items={[
            { id: 'favoritos', label: 'Favoritos', icon: <Star className="h-3.5 w-3.5" aria-hidden /> },
            { id: 'recientes', label: 'Recientes', icon: <Clock3 className="h-3.5 w-3.5" aria-hidden /> },
          ]}
        />
      </div>

      {error ? (
        <ApiErrorState
          error={error}
          onRetry={() => void (tab === 'favoritos' ? bookmarks.refetch() : recent.refetch())}
        />
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : tab === 'favoritos' ? (
        <DocumentList
          documents={bookmarks.bookmarks}
          emptyText="Todavía no has marcado documentos como favoritos. Usa la estrella del visor para añadirlos."
        />
      ) : (
        <DocumentList
          documents={recent.data ?? []}
          emptyText="Aquí aparecerán los últimos documentos que abras."
          timestamp={(doc) => {
            const entry = (recent.data ?? []).find((item) => item.id === doc.id);
            return entry ? `Visto el ${formatDateTime(entry.viewed_at)}` : undefined;
          }}
        />
      )}
    </section>
  );
}
