import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderOpen, Mail, Plus, Search } from 'lucide-react';
import * as expedientesApi from '@/api/expedientes';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate, relativeDays } from '@/lib/format';
import type { Expediente, ExpedienteEstado } from '@/types/api';
import type { Column } from '@/types/ui';
import { NewCorrespondenceForm } from './NewCorrespondenceForm';
import { NewExpedienteForm } from './NewExpedienteForm';

const ESTADO_COLORS: Record<ExpedienteEstado, string> = {
  ABIERTO: 'var(--color-success)',
  CERRADO: 'var(--color-warning)',
  TRANSFERIDO: 'var(--color-info)',
};

type Kind = 'expediente' | 'correspondencia';

export default function ExpedientesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeModules, moduleLabel, moduleColor, correspondenceType } = useCatalogs();
  const { canRead, canWrite } = useAuth();

  const kindParam = searchParams.get('tipo');
  const [kind, setKind] = useState<Kind>(kindParam === 'correspondencia' ? 'correspondencia' : 'expediente');
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [moduleFilter, setModuleFilter] = useState('');
  const [estado, setEstado] = useState('');
  const [creating, setCreating] = useState(false);

  const pagination = usePagination({ initialSort: 'created_at' });

  const query = useMemo(
    () => ({
      type: kind,
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
      ...(moduleFilter ? { module: moduleFilter } : {}),
      ...(estado ? { estado } : {}),
    }),
    [kind, pagination.page, pagination.pageSize, pagination.sort, pagination.order, debounced, moduleFilter, estado],
  );

  const expedientes = useQuery(`expedientes:${JSON.stringify(query)}`, (signal) =>
    expedientesApi.listExpedientes(query, signal),
  );

  const writableModules = activeModules.filter((module) => canWrite(module.code));
  const readableModules = activeModules.filter((module) => canRead(module.code));

  const columns = useMemo<Column<Expediente>[]>(() => {
    const base: Column<Expediente>[] = [
      {
        key: 'radicado',
        header: 'Radicado',
        sortField: 'radicado',
        required: true,
        render: (row) => <span className="font-mono text-xs text-acid">{row.radicado}</span>,
      },
      {
        key: 'titulo',
        header: 'Título',
        sortField: 'titulo',
        primary: true,
        required: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{row.titulo}</p>
            {row.descripcion && (
              <p className="truncate text-[11px] text-content-muted">{row.descripcion}</p>
            )}
          </div>
        ),
      },
      {
        key: 'module',
        header: 'Dependencia',
        sortField: 'module_code',
        render: (row) => <Badge color={moduleColor(row.module_code)}>{moduleLabel(row.module_code)}</Badge>,
      },
      {
        key: 'estado',
        header: 'Estado',
        sortField: 'estado',
        render: (row) => <Badge color={ESTADO_COLORS[row.estado]}>{row.estado}</Badge>,
      },
      {
        key: 'documents',
        header: 'Docs.',
        render: (row) => <span className="font-mono text-xs">{row.document_count}</span>,
      },
      {
        key: 'apertura',
        header: 'Apertura',
        sortField: 'fecha_apertura',
        render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.fecha_apertura)}</span>,
      },
    ];

    if (kind === 'correspondencia') {
      base.splice(3, 0, {
        key: 'tipo',
        header: 'Tipo',
        render: (row) => (
          <span className="text-xs">
            {correspondenceType(row.correspondence_type_code)?.name ?? row.correspondence_type_code ?? '—'}
          </span>
        ),
      });
      base.push({
        key: 'vence',
        header: 'Respuesta',
        sortField: 'response_due_at',
        render: (row) => {
          if (row.responded_at) return <Badge color="var(--color-success)">Respondida</Badge>;
          if (!row.response_due_at) return <span className="text-xs text-content-muted">—</span>;
          const overdue = new Date(row.response_due_at).getTime() < Date.now();
          return (
            <Badge color={overdue ? 'var(--color-danger)' : 'var(--color-warning)'}>
              {overdue ? 'Vencida' : relativeDays(row.response_due_at)}
            </Badge>
          );
        },
      });
    }

    return base;
  }, [kind, moduleColor, moduleLabel, correspondenceType]);

  const changeKind = (next: Kind): void => {
    setKind(next);
    pagination.setPage(1);
    const params = new URLSearchParams(searchParams);
    params.set('tipo', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Expedientes"
        description="Expedientes electrónicos y correspondencia radicada."
        icon={<FolderOpen className="h-5 w-5 text-state-warning" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Expedientes' }]}
        actions={
          <>
            <HelpButton
              slug="ciclo-documental"
              contextLabel="Expedientes"
              label="Ayuda de expedientes"
            />
            {writableModules.length > 0 && (
              <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>
                {kind === 'correspondencia' ? 'Radicar correspondencia' : 'Nuevo expediente'}
              </Button>
            )}
          </>
        }
      />

      <Tabs
        className="mb-4"
        ariaLabel="Tipo de expediente"
        value={kind}
        onChange={(id) => changeKind(id as Kind)}
        items={[
          {
            id: 'expediente',
            label: 'Expedientes',
            icon: <FolderOpen className="h-3.5 w-3.5" aria-hidden />,
          },
          {
            id: 'correspondencia',
            label: 'Correspondencia',
            icon: <Mail className="h-3.5 w-3.5" aria-hidden />,
          },
        ]}
      />

      <Toolbar className="mb-4" ariaLabel="Filtros de expedientes">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar por título o radicado…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar expedientes"
        />
        <Select
          className="w-52"
          aria-label="Filtrar por dependencia"
          placeholder="Todas las dependencias"
          value={moduleFilter}
          onChange={(e) => {
            setModuleFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={readableModules.map((module) => ({ value: module.code, label: module.name }))}
        />
        <Select
          className="w-44"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            pagination.setPage(1);
          }}
          options={[
            { value: 'ABIERTO', label: 'Abierto' },
            { value: 'CERRADO', label: 'Cerrado' },
            { value: 'TRANSFERIDO', label: 'Transferido' },
          ]}
        />
      </Toolbar>

      {expedientes.error ? (
        <ApiErrorState error={expedientes.error} onRetry={() => void expedientes.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={expedientes.data?.data ?? []}
          rowKey={(row) => row.id}
          loading={expedientes.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={expedientes.data?.page ?? pagination.page}
          pageSize={expedientes.data?.pageSize ?? pagination.pageSize}
          total={expedientes.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          onRowClick={(row) => navigate(`/expedientes/${row.id}`)}
          emptyTitle={kind === 'correspondencia' ? 'Sin correspondencia' : 'Sin expedientes'}
          emptyDescription="Crea el primero para agrupar documentos bajo un radicado."
          emptyAction={
            writableModules.length > 0 ? { label: 'Crear', onClick: () => setCreating(true) } : undefined
          }
          caption="Listado de expedientes"
        />
      )}

      {creating && kind === 'expediente' && (
        <NewExpedienteForm
          open
          modules={writableModules}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            invalidatePrefix('expedientes:');
            navigate(`/expedientes/${created.id}`);
          }}
        />
      )}

      {creating && kind === 'correspondencia' && (
        <NewCorrespondenceForm
          open
          modules={writableModules}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            invalidatePrefix('expedientes:');
            navigate(`/expedientes/${created.id}`);
          }}
        />
      )}
    </>
  );
}
