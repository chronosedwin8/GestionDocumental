import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FolderOpen, Search, UserRound } from 'lucide-react';
import * as searchApi from '@/api/search';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  badge?: { text: string; color?: string };
  icon: React.ReactNode;
  to: string;
}

/** Longitud mínima antes de consultar al servidor. */
const MIN_TERM = 2;

/**
 * Paleta de comandos Ctrl+K (U2): busca en documentos, expedientes y personas
 * con `GET /search/global` y ofrece las dependencias del catálogo como atajo.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps): React.JSX.Element | null {
  const navigate = useNavigate();
  const { activeModules, moduleColor, moduleLabel, personTypeLabel } = useCatalogs();
  const { canRead } = useAuth();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term.trim(), 250);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) {
      setTerm('');
      setActive(0);
    }
  }, [open]);

  const enabled = open && debounced.length >= MIN_TERM;
  const results = useQuery(
    enabled ? `search:global:${debounced}` : null,
    (signal) => searchApi.global(debounced, signal),
    { staleTime: 10_000 },
  );

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const needle = debounced.toLocaleLowerCase('es');

    for (const doc of results.data?.documents ?? []) {
      list.push({
        id: `doc-${doc.id}`,
        group: 'Documentos',
        label: doc.title,
        hint: doc.folio_index ?? doc.type,
        badge: { text: moduleLabel(doc.module_code), color: moduleColor(doc.module_code) },
        icon: <FileText className="h-4 w-4" aria-hidden />,
        to: `/documentos/${doc.id}`,
      });
    }
    for (const exp of results.data?.expedientes ?? []) {
      list.push({
        id: `exp-${exp.id}`,
        group: 'Expedientes',
        label: exp.titulo,
        hint: exp.radicado,
        badge: { text: moduleLabel(exp.module_code), color: moduleColor(exp.module_code) },
        icon: <FolderOpen className="h-4 w-4" aria-hidden />,
        to: `/expedientes/${exp.id}`,
      });
    }
    for (const person of results.data?.people ?? []) {
      list.push({
        id: `per-${person.id}`,
        group: 'Personas',
        label: person.full_name,
        hint: person.document_number,
        badge: { text: personTypeLabel(person.type_code) },
        icon: <UserRound className="h-4 w-4" aria-hidden />,
        to: `/personas/${person.id}`,
      });
    }

    // Dependencias del catálogo: filtro local sobre una lista ya cargada.
    if (needle.length > 0) {
      for (const module of activeModules) {
        if (!canRead(module.code)) continue;
        if (!module.name.toLocaleLowerCase('es').includes(needle)) continue;
        list.push({
          id: `mod-${module.code}`,
          group: 'Dependencias',
          label: module.name,
          hint: module.description ?? undefined,
          icon: (
            <DynamicIcon
              name={module.icon}
              className="h-4 w-4"
              style={{ color: moduleColor(module.code) }}
            />
          ),
          to: `/modulos/${module.code}`,
        });
      }
    }

    return list;
  }, [results.data, debounced, activeModules, canRead, moduleColor, moduleLabel, personTypeLabel]);

  useEffect(() => setActive(0), [items.length, debounced]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: PaletteItem | undefined): void => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (items.length === 0 ? 0 : (index + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[active]);
    }
  };

  if (!open) return null;

  let groupSeen = '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Búsqueda global"
      description="Documentos, expedientes, personas y dependencias. Flechas para moverte, Enter para abrir."
      bodyClassName="p-0"
    >
      <div className="border-b border-line p-3">
        <Input
          data-autofocus
          role="combobox"
          aria-expanded
          aria-controls="paleta-resultados"
          aria-autocomplete="list"
          aria-activedescendant={items[active] ? `paleta-item-${items[active].id}` : undefined}
          aria-label="Término de búsqueda global"
          placeholder="Busca documentos, expedientes o personas…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          icon={<Search className="h-4 w-4" />}
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2">
        {results.error ? (
          <ApiErrorState error={results.error} onRetry={() => void results.refetch()} />
        ) : debounced.length < MIN_TERM ? (
          <p className="px-3 py-6 text-center text-sm text-content-muted">
            Escribe al menos {MIN_TERM} caracteres para buscar en todo el archivo.
          </p>
        ) : results.loading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Spinner label="Buscando" />
            <span className="text-sm text-content-muted">Buscando…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Sin coincidencias"
            description="No se encontraron documentos, expedientes ni personas con ese término."
            action={{ label: 'Abrir búsqueda avanzada', to: '/buscar?modo=avanzada' }}
          />
        ) : (
          <ul
            id="paleta-resultados"
            role="listbox"
            aria-label="Resultados"
            ref={listRef}
            className="space-y-0.5"
          >
            {items.map((item, index) => {
              const header = item.group !== groupSeen ? item.group : null;
              groupSeen = item.group;
              return (
                <li key={item.id}>
                  {header && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    id={`paleta-item-${item.id}`}
                    aria-selected={index === active}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      index === active
                        ? 'bg-acid-soft text-acid'
                        : 'text-content-secondary hover:bg-surface-overlay',
                    )}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.label}</span>
                      {item.hint && (
                        <span className="block truncate font-mono text-[10px] text-content-muted">
                          {item.hint}
                        </span>
                      )}
                    </span>
                    {item.badge && <Badge color={item.badge.color}>{item.badge.text}</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
