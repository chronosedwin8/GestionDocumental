import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileUp, Search, X } from 'lucide-react';
import * as documentsApi from '@/api/documents';
import * as peopleApi from '@/api/people';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toolbar } from '@/components/ui/Toolbar';
import { DocumentTable } from './DocumentTable';
import { DocumentViewer } from './DocumentViewer';
import { UploadWizard } from './UploadWizard';

/** Listado de documentos de una dependencia con filtros y carga guiada. */
export default function ModuleViewPage(): React.JSX.Element {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { module, moduleLabel, moduleColor, moduleDescription, statuses, catalogs } = useCatalogs();
  const { canRead, canWrite } = useAuth();

  const pagination = usePagination();
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term, 400);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [period, setPeriod] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  // Periodos académicos: filtro server-side (`period_id`) para boletines y actas.
  const periods = useQuery('academic-periods', (signal) => peopleApi.listAcademicPeriods(signal), {
    staleTime: 300_000,
  });

  const openDocId = searchParams.get('doc');

  const query = useMemo(
    () => ({
      module: code,
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debouncedTerm.trim() ? { q: debouncedTerm.trim() } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(period ? { period_id: period } : {}),
    }),
    [
      code,
      pagination.page,
      pagination.pageSize,
      pagination.sort,
      pagination.order,
      debouncedTerm,
      status,
      type,
      period,
    ],
  );

  const key = `documents:${code}:${JSON.stringify(query)}`;
  const documents = useQuery(code ? key : null, (signal) => documentsApi.listDocuments(query, signal));

  const openDocument = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('doc', id);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const closeDocument = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('doc');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // El catálogo aún no ha llegado: no se puede decidir si el módulo existe.
  if (!catalogs) return <></>;

  const moduleInfo = module(code);
  if (!moduleInfo) {
    return (
      <EmptyState
        title="Dependencia no encontrada"
        description={`El código "${code}" no existe en el catálogo de módulos.`}
        action={{ label: 'Volver al panel', to: '/' }}
      />
    );
  }
  if (!canRead(code)) return <Navigate to="/" replace />;

  const writable = canWrite(code);
  const typeOptions = Array.from(new Set((documents.data?.data ?? []).map((doc) => doc.type))).sort();

  return (
    <>
      <PageHeader
        title={moduleLabel(code)}
        description={moduleDescription(code) || undefined}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: moduleLabel(code) }]}
        icon={
          <DynamicIcon name={moduleInfo.icon} className="h-5 w-5" style={{ color: moduleColor(code) }} />
        }
        actions={
          <>
            <HelpButton
              moduleCode={code}
              contextLabel={moduleLabel(code)}
              label={`Ayuda de ${moduleLabel(code)}`}
            />
            {writable && (
              <Button
                variant="primary"
                onClick={() => setWizardOpen(true)}
                icon={<FileUp className="h-4 w-4" />}
              >
                Cargar documentos
              </Button>
            )}
          </>
        }
      />

      <Toolbar className="mb-4" ariaLabel="Filtros de documentos">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar en esta dependencia…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar documentos"
        />
        <Select
          className="w-48"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            pagination.setPage(1);
          }}
          options={statuses.map((entry) => ({ value: entry.code, label: entry.name }))}
        />
        <Select
          className="w-52"
          aria-label="Filtrar por tipo documental"
          placeholder="Todos los tipos"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            pagination.setPage(1);
          }}
          options={typeOptions.map((entry) => ({ value: entry, label: entry }))}
        />
        {(periods.data ?? []).length > 0 && (
          <Select
            className="w-52"
            aria-label="Filtrar por periodo académico"
            placeholder="Todos los periodos"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              pagination.setPage(1);
            }}
            options={(periods.data ?? []).map((entry) => ({
              value: entry.id,
              label: entry.is_current ? `${entry.name} (actual)` : entry.name,
            }))}
          />
        )}
        {(term || status || type || period) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTerm('');
              setStatus('');
              setType('');
              setPeriod('');
              pagination.setPage(1);
            }}
            icon={<X className="h-3.5 w-3.5" />}
          >
            Limpiar
          </Button>
        )}
      </Toolbar>

      {documents.error ? (
        <ApiErrorState error={documents.error} onRetry={() => void documents.refetch()} />
      ) : (
        <DocumentTable
          documents={documents.data?.data ?? []}
          loading={documents.loading}
          page={documents.data?.page ?? pagination.page}
          pageSize={documents.data?.pageSize ?? pagination.pageSize}
          total={documents.data?.total ?? 0}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          onOpen={(doc) => openDocument(doc.id)}
          showBookmark
          emptyTitle="Sin documentos"
          emptyDescription={
            writable
              ? 'Carga el primer documento de esta dependencia para empezar.'
              : 'Aún no hay documentos registrados en esta dependencia.'
          }
          emptyAction={writable ? { label: 'Cargar documentos', onClick: () => setWizardOpen(true) } : undefined}
        />
      )}

      <UploadWizard
        open={wizardOpen}
        moduleCode={code}
        onClose={() => setWizardOpen(false)}
        onUploaded={() => {
          invalidatePrefix(`documents:${code}`);
          invalidatePrefix('stats:');
          void documents.refetch();
        }}
      />

      {openDocId && (
        <DocumentViewer
          open
          documentId={openDocId}
          onClose={closeDocument}
          onNavigate={(id) => navigate(`/documentos/${id}`)}
          onRemoved={() => void documents.refetch()}
        />
      )}
    </>
  );
}
