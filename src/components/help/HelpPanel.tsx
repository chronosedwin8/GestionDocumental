import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileQuestion } from 'lucide-react';
import * as helpApi from '@/api/help';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { MarkdownView } from '@/components/ui/MarkdownView';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { HelpArticle } from '@/types/api';

export interface HelpTarget {
  /** Artículo concreto que la pantalla quiere mostrar primero. */
  slug?: string;
  /** Dependencia cuyos artículos interesan (`GET /help?module=`). */
  moduleCode?: string;
  /** Título mostrado en la cabecera del panel. */
  contextLabel?: string;
}

export interface HelpPanelProps extends HelpTarget {
  open: boolean;
  onClose: () => void;
}

/**
 * Panel de ayuda contextual (U10). Todo el contenido viene de `GET /help`:
 * el cliente no lleva ni un párrafo de ayuda en el JSX.
 */
export function HelpPanel({
  open,
  onClose,
  slug,
  moduleCode,
  contextLabel,
}: HelpPanelProps): React.JSX.Element {
  const { isAdminArea } = useAuth();
  const { moduleLabel } = useCatalogs();
  const [selected, setSelected] = useState<string | null>(slug ?? null);

  const listKey = open ? `help:panel:${moduleCode ?? 'all'}` : null;
  const list = useQuery(listKey, (signal) =>
    helpApi.listHelp(moduleCode ? { module: moduleCode } : {}, signal),
  );

  const articles = useMemo<HelpArticle[]>(() => list.data ?? [], [list.data]);

  // El artículo pedido puede no estar en la lista filtrada por módulo.
  const missingRequested = slug !== undefined && articles.length > 0 && !articles.some((a) => a.slug === slug);
  const direct = useQuery(
    open && slug && missingRequested ? `help:article:${slug}` : null,
    (signal) => helpApi.getHelp(slug as string, signal),
  );

  const available = useMemo<HelpArticle[]>(
    () => (direct.data ? [direct.data, ...articles] : articles),
    [direct.data, articles],
  );

  useEffect(() => {
    if (!open) return;
    setSelected(slug ?? null);
  }, [open, slug]);

  const current =
    available.find((article) => article.slug === selected) ?? available[0] ?? null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-full max-w-xl"
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-acid" aria-hidden />
          Ayuda{contextLabel ? ` · ${contextLabel}` : ''}
        </span>
      }
    >
      {list.error ? (
        <ApiErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : available.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="h-8 w-8" />}
          title="Todavía no hay artículos de ayuda"
          description={
            isAdminArea
              ? 'Crea el primer artículo desde Administración → Ayuda para que aparezca aquí.'
              : 'Pide al administrador que publique la ayuda de esta pantalla.'
          }
          action={isAdminArea ? { label: 'Ir a Administración', to: '/admin/ayuda' } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {available.length > 1 && (
            <nav aria-label="Artículos de ayuda">
              <ul className="flex flex-wrap gap-1.5">
                {available.map((article) => (
                  <li key={article.slug}>
                    <button
                      type="button"
                      onClick={() => setSelected(article.slug)}
                      aria-current={article.slug === current?.slug ? 'true' : undefined}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                        article.slug === current?.slug
                          ? 'border-acid-border bg-acid-soft text-acid'
                          : 'border-line text-content-secondary hover:bg-surface-overlay hover:text-content-primary',
                      )}
                    >
                      {article.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {current && (
            <article>
              <header className="mb-3 border-b border-line pb-3">
                <h3 className="font-display text-base text-content-primary">{current.title}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
                  {current.module_code && <Badge>{moduleLabel(current.module_code)}</Badge>}
                  <span>Actualizado el {formatDate(current.updated_at)}</span>
                </p>
              </header>
              <MarkdownView source={current.body_md} />
            </article>
          )}
        </div>
      )}
    </Drawer>
  );
}
