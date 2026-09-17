import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Filter, Search, Sparkles, Type, X } from 'lucide-react';
import * as searchApi from '@/api/search';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { usePagination } from '@/hooks/usePagination';
import { useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { DocumentTable } from '../documents/DocumentTable';
import { DocumentViewer } from '../documents/DocumentViewer';
import type { SemanticSearchResult } from '@/types/api';

type Mode = 'semantica' | 'texto' | 'avanzada';

interface AdvancedFilters {
  keyword: string;
  author: string;
  date_from: string;
  date_to: string;
  module: string;
  tag: string;
  status: string;
  type: string;
  folio: string;
}

const EMPTY_FILTERS: AdvancedFilters = {
  keyword: '',
  author: '',
  date_from: '',
  date_to: '',
  module: '',
  tag: '',
  status: '',
  type: '',
  folio: '',
};

export default function SearchPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeModules, statuses, settings } = useCatalogs();
  const { canRead } = useAuth();

  const modeParam = searchParams.get('modo');
  const [mode, setMode] = useState<Mode>(
    modeParam === 'texto' || modeParam === 'avanzada' ? modeParam : 'semantica',
  );

  /* ------------------------------------------------------- texto completo */
  const ftPagination = usePagination({ initialSort: 'created_at' });
  const [ftTerm, setFtTerm] = useState('');
  const [ftSubmitted, setFtSubmitted] = useState('');
  const [ftModule, setFtModule] = useState('');

  const ftQuery = useMemo(
    () => ({
      q: ftSubmitted,
      page: ftPagination.page,
      pageSize: ftPagination.pageSize,
      sort: ftPagination.sort,
      order: ftPagination.order,
      ...(ftModule ? { module: ftModule } : {}),
    }),
    [ftSubmitted, ftPagination.page, ftPagination.pageSize, ftPagination.sort, ftPagination.order, ftModule],
  );

  const fulltext = useQuery(
    ftSubmitted.trim() ? `search:fulltext:${JSON.stringify(ftQuery)}` : null,
    (signal) => searchApi.fulltext(ftQuery, signal),
  );

  /* ------------------------------------------------------------ avanzada */
  const advPagination = usePagination({ initialSort: 'created_at' });
  const [filters, setFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [advSubmitted, setAdvSubmitted] = useState<AdvancedFilters | null>(null);

  const advQuery = useMemo(() => {
    if (!advSubmitted) return null;
    const entries = Object.entries(advSubmitted).filter(([, value]) => value !== '');
    return {
      ...Object.fromEntries(entries),
      page: advPagination.page,
      pageSize: advPagination.pageSize,
      sort: advPagination.sort,
      order: advPagination.order,
    } as searchApi.AdvancedQuery;
  }, [advSubmitted, advPagination.page, advPagination.pageSize, advPagination.sort, advPagination.order]);

  const advanced = useQuery(
    advQuery ? `search:advanced:${JSON.stringify(advQuery)}` : null,
    (signal) => searchApi.advanced(advQuery as searchApi.AdvancedQuery, signal),
  );

  /* ----------------------------------------------------------- semántica */
  const [semTerm, setSemTerm] = useState('');
  const [semModule, setSemModule] = useState('');
  const [semResult, setSemResult] = useState<SemanticSearchResult | null>(null);
  const [semLoading, setSemLoading] = useState(false);
  const [semError, setSemError] = useState<ApiError | null>(null);

  const runSemantic = useCallback(async (): Promise<void> => {
    const query = semTerm.trim();
    if (!query) return;
    setSemLoading(true);
    setSemError(null);
    setSemResult(null);
    try {
      setSemResult(await searchApi.semantic(query, semModule || undefined));
    } catch (err) {
      setSemError(
        err instanceof ApiError ? err : new ApiError('INTERNAL', 'No se pudo completar la búsqueda.', 0),
      );
    } finally {
      setSemLoading(false);
    }
  }, [semTerm, semModule]);

  /* ---------------------------------------------------------------- visor */
  const openDocId = searchParams.get('doc');
  const openDocument = (id: string): void => {
    const next = new URLSearchParams(searchParams);
    next.set('doc', id);
    setSearchParams(next);
  };
  const closeDocument = (): void => {
    const next = new URLSearchParams(searchParams);
    next.delete('doc');
    setSearchParams(next, { replace: true });
  };

  const moduleOptions = activeModules
    .filter((module) => canRead(module.code))
    .map((module) => ({ value: module.code, label: module.name }));

  const changeMode = (next: Mode): void => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    params.set('modo', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Búsqueda"
        description="Encuentra documentos por contenido, metadatos o en lenguaje natural."
        icon={<Search className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Búsqueda' }]}
        actions={<HelpButton slug="busqueda" contextLabel="Búsqueda" label="Ayuda de la búsqueda" />}
      />

      <Tabs
        className="mb-4"
        ariaLabel="Modos de búsqueda"
        value={mode}
        onChange={(id) => changeMode(id as Mode)}
        items={[
          {
            id: 'semantica',
            label: 'Semántica (IA)',
            icon: <Sparkles className="h-3.5 w-3.5" aria-hidden />,
            disabled: settings ? !settings.ai_enabled : false,
          },
          { id: 'texto', label: 'Texto completo', icon: <Type className="h-3.5 w-3.5" aria-hidden /> },
          { id: 'avanzada', label: 'Avanzada', icon: <Filter className="h-3.5 w-3.5" aria-hidden /> },
        ]}
      />

      {/* ------------------------------------------------------ semántica */}
      {mode === 'semantica' && (
        <div className="space-y-4">
          <div className="panel">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[240px] flex-1"
                placeholder="Ej. contratos de mantenimiento firmados el año pasado"
                value={semTerm}
                onChange={(e) => setSemTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSemantic();
                }}
                icon={<Sparkles className="h-4 w-4" />}
                aria-label="Consulta en lenguaje natural"
              />
              <Select
                className="w-56"
                aria-label="Limitar a una dependencia"
                placeholder="Todas las dependencias"
                value={semModule}
                onChange={(e) => setSemModule(e.target.value)}
                options={moduleOptions}
              />
              <Button
                variant="primary"
                loading={semLoading}
                disabled={semTerm.trim() === ''}
                onClick={() => void runSemantic()}
              >
                Buscar
              </Button>
            </div>
          </div>

          {semError && <ApiErrorState error={semError} onRetry={() => void runSemantic()} />}
          {semLoading && (
            <div className="panel flex items-center gap-3">
              <Spinner label="Analizando el archivo" />
              <span className="text-sm text-content-muted">Analizando el archivo documental…</span>
            </div>
          )}

          {semResult && (
            <>
              <div className="panel border-acid-border bg-acid-soft">
                <p className="mb-1 flex items-center gap-2 text-xs font-medium text-acid">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Interpretación del asistente
                </p>
                <p className="whitespace-pre-line text-sm text-content-secondary">
                  {semResult.explanation}
                </p>
              </div>

              {semResult.documents.length === 0 ? (
                <EmptyState
                  title="Sin coincidencias"
                  description="Prueba con otras palabras o usa la búsqueda avanzada."
                />
              ) : (
                <DocumentTable
                  documents={semResult.documents}
                  loading={false}
                  page={1}
                  pageSize={semResult.documents.length}
                  total={semResult.documents.length}
                  sort=""
                  order="desc"
                  onSortChange={() => undefined}
                  onPageChange={() => undefined}
                  onOpen={(doc) => openDocument(doc.id)}
                  showModule
                />
              )}
            </>
          )}

          {!semResult && !semLoading && !semError && (
            <EmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title="Búsqueda en lenguaje natural"
              description="Describe lo que necesitas y el asistente propondrá los documentos más relevantes del archivo."
            />
          )}
        </div>
      )}

      {/* --------------------------------------------------- texto completo */}
      {mode === 'texto' && (
        <div className="space-y-4">
          <div className="panel">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[240px] flex-1"
                placeholder="Palabras contenidas en el documento, título o folio…"
                value={ftTerm}
                onChange={(e) => setFtTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setFtSubmitted(ftTerm);
                    ftPagination.setPage(1);
                  }
                }}
                icon={<Search className="h-4 w-4" />}
                aria-label="Términos de búsqueda"
              />
              <Select
                className="w-56"
                aria-label="Filtrar por dependencia"
                placeholder="Todas las dependencias"
                value={ftModule}
                onChange={(e) => {
                  setFtModule(e.target.value);
                  ftPagination.setPage(1);
                }}
                options={moduleOptions}
              />
              <Button
                variant="primary"
                disabled={ftTerm.trim() === ''}
                onClick={() => {
                  setFtSubmitted(ftTerm);
                  ftPagination.setPage(1);
                }}
              >
                Buscar
              </Button>
            </div>
          </div>

          {fulltext.error ? (
            <ApiErrorState error={fulltext.error} onRetry={() => void fulltext.refetch()} />
          ) : !ftSubmitted.trim() ? (
            <EmptyState
              icon={<Type className="h-8 w-8" />}
              title="Busca dentro del contenido"
              description="El servidor indexa el texto extraído de los archivos, no sólo los títulos."
            />
          ) : (
            <DocumentTable
              documents={fulltext.data?.data ?? []}
              loading={fulltext.loading}
              page={fulltext.data?.page ?? ftPagination.page}
              pageSize={fulltext.data?.pageSize ?? ftPagination.pageSize}
              total={fulltext.data?.total ?? 0}
              sort={ftPagination.sort}
              order={ftPagination.order}
              onSortChange={ftPagination.toggleSort}
              onPageChange={ftPagination.setPage}
              onPageSizeChange={ftPagination.setPageSize}
              onOpen={(doc) => openDocument(doc.id)}
              showModule
              emptyTitle="Sin resultados"
              emptyDescription="Ningún documento coincide con esos términos."
            />
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- avanzada */}
      {mode === 'avanzada' && (
        <div className="space-y-4">
          <div className="panel">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField label="Palabra clave">
                <Input
                  value={filters.keyword}
                  onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                />
              </FormField>
              <FormField label="Autor">
                <Input
                  value={filters.author}
                  onChange={(e) => setFilters({ ...filters, author: e.target.value })}
                  placeholder="Nombre o correo"
                />
              </FormField>
              <FormField label="Folio">
                <Input
                  value={filters.folio}
                  onChange={(e) => setFilters({ ...filters, folio: e.target.value })}
                />
              </FormField>
              <FormField label="Dependencia">
                <Select
                  placeholder="Todas"
                  value={filters.module}
                  onChange={(e) => setFilters({ ...filters, module: e.target.value })}
                  options={moduleOptions}
                />
              </FormField>
              <FormField label="Estado">
                <Select
                  placeholder="Todos"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  options={statuses.map((entry) => ({ value: entry.code, label: entry.name }))}
                />
              </FormField>
              <FormField label="Tipo documental">
                <Input
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                />
              </FormField>
              <FormField label="Etiqueta">
                <Input
                  value={filters.tag}
                  onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
                />
              </FormField>
              <FormField label="Desde">
                <Input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                />
              </FormField>
              <FormField label="Hasta">
                <Input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                />
              </FormField>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setAdvSubmitted(filters);
                  advPagination.setPage(1);
                }}
              >
                Aplicar filtros
              </Button>
              <Button
                variant="ghost"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setAdvSubmitted(null);
                }}
              >
                Limpiar
              </Button>
            </div>
          </div>

          {advanced.error ? (
            <ApiErrorState error={advanced.error} onRetry={() => void advanced.refetch()} />
          ) : !advSubmitted ? (
            <EmptyState
              icon={<Filter className="h-8 w-8" />}
              title="Combina filtros"
              description="Acota por dependencia, fechas, estado, tipo documental, autor, folio o etiqueta."
            />
          ) : (
            <DocumentTable
              documents={advanced.data?.data ?? []}
              loading={advanced.loading}
              page={advanced.data?.page ?? advPagination.page}
              pageSize={advanced.data?.pageSize ?? advPagination.pageSize}
              total={advanced.data?.total ?? 0}
              sort={advPagination.sort}
              order={advPagination.order}
              onSortChange={advPagination.toggleSort}
              onPageChange={advPagination.setPage}
              onPageSizeChange={advPagination.setPageSize}
              onOpen={(doc) => openDocument(doc.id)}
              showModule
              emptyTitle="Sin resultados"
              emptyDescription="Ningún documento cumple todos los filtros."
            />
          )}
        </div>
      )}

      {mode === 'semantica' && settings && !settings.ai_enabled && (
        <ApiErrorState
          className="mt-4"
          error={new ApiError('AI_NOT_CONFIGURED', 'IA no disponible.', 503)}
        />
      )}

      {openDocId && (
        <DocumentViewer
          open
          documentId={openDocId}
          onClose={closeDocument}
          onNavigate={(id) => navigate(`/documentos/${id}`)}
        />
      )}

      {(fulltext.validating || advanced.validating) && (
        <div className="pointer-events-none fixed bottom-20 right-4 md:bottom-4">
          <Skeleton className="h-1 w-24" />
        </div>
      )}
    </>
  );
}
