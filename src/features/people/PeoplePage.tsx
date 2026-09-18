import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, UserRound, X } from 'lucide-react';
import * as peopleApi from '@/api/people';
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
import { Toolbar } from '@/components/ui/Toolbar';
import type { PersonSummary } from '@/types/api';
import { useFeature } from '@/hooks/useFeature';
import type { Column } from '@/types/ui';
import { PersonForm } from './PersonForm';

/** Listado de personas con filtros, búsqueda y paginación en servidor (P6/P7). */
export default function PeoplePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { personTypes, personTypeLabel } = useCatalogs();
  const { hasFullAccess, canManageUsers } = useAuth();

  const pagination = usePagination({ initialSort: 'last_name', initialOrder: 'asc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const typeFilter = searchParams.get('tipo') ?? '';
  const statusFilter = searchParams.get('estado') ?? '';
  const [creating, setCreating] = useState(false);

  // `POST/PATCH /people` responde 403 sin escritura en alguna dependencia
  // (CONTRACT_NOTES §9), así que la alta se ofrece solo con la característica.
  const canManagePeople = useFeature('PEOPLE_MANAGE');
  const canEdit = (hasFullAccess || canManageUsers) && canManagePeople;

  const setParam = (key: string, value: string): void => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    pagination.setPage(1);
  };

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(statusFilter === 'ACTIVE' || statusFilter === 'INACTIVE'
        ? { status: statusFilter as 'ACTIVE' | 'INACTIVE' }
        : {}),
    }),
    [pagination.page, pagination.pageSize, debounced, typeFilter, statusFilter],
  );

  const people = useQuery(`people:list:${JSON.stringify(query)}`, (signal) =>
    peopleApi.listPeople(query, signal),
  );

  const columns = useMemo<Column<PersonSummary>[]>(
    () => [
      {
        key: 'name',
        header: 'Persona',
        required: true,
        primary: true,
        render: (person) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-acid-soft">
              <UserRound className="h-3.5 w-3.5 text-acid" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-content-primary">{person.full_name}</p>
              <p className="truncate font-mono text-[11px] text-content-muted">
                {person.document_number}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'type',
        header: 'Tipo',
        render: (person) => <Badge>{personTypeLabel(person.type_code)}</Badge>,
      },
      {
        key: 'status',
        header: 'Estado',
        render: (person) => (
          <Badge color={person.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-danger)'}>
            {person.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
          </Badge>
        ),
      },
    ],
    [personTypeLabel],
  );

  const filtersApplied = term !== '' || typeFilter !== '' || statusFilter !== '';

  return (
    <>
      <PageHeader
        title="Personas"
        description="Empleados, estudiantes y terceros: el eje de las hojas de vida y los expedientes académicos."
        icon={<UserRound className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Personas' }]}
        actions={
          <>
            <HelpButton slug="primeros-pasos" contextLabel="Personas" label="Ayuda sobre personas" />
            {canEdit && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Registrar persona
              </Button>
            )}
          </>
        }
      />

      <Toolbar className="mb-4" ariaLabel="Filtros de personas">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar por nombre o documento…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar personas"
        />
        <Select
          className="w-52"
          aria-label="Filtrar por tipo de persona"
          placeholder="Todos los tipos"
          value={typeFilter}
          onChange={(e) => setParam('tipo', e.target.value)}
          options={personTypes.map((type) => ({ value: type.code, label: type.name }))}
        />
        <Select
          className="w-40"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
          value={statusFilter}
          onChange={(e) => setParam('estado', e.target.value)}
          options={[
            { value: 'ACTIVE', label: 'Activos' },
            { value: 'INACTIVE', label: 'Inactivos' },
          ]}
        />
        {filtersApplied && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => {
              setTerm('');
              const next = new URLSearchParams(searchParams);
              next.delete('tipo');
              next.delete('estado');
              setSearchParams(next, { replace: true });
              pagination.setPage(1);
            }}
          >
            Limpiar
          </Button>
        )}
      </Toolbar>

      {people.error ? (
        <ApiErrorState error={people.error} onRetry={() => void people.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={people.data?.data ?? []}
          rowKey={(person) => person.id}
          loading={people.loading}
          page={people.data?.page ?? pagination.page}
          pageSize={people.data?.pageSize ?? pagination.pageSize}
          total={people.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          onRowClick={(person) => navigate(`/personas/${person.id}`)}
          caption="Listado de personas"
          emptyTitle={filtersApplied ? 'Sin coincidencias' : 'Todavía no hay personas registradas'}
          emptyDescription={
            filtersApplied
              ? 'Ninguna persona cumple los filtros seleccionados.'
              : // `GET /people` está filtrado por las dependencias legibles: sin
                // ninguna, el servidor responde 200 con total 0. No es un fallo.
                'No hay personas visibles para ti. O todavía no se ha registrado ninguna, o tu rol no tiene acceso de lectura a las dependencias donde están.'
          }
          emptyAction={
            canEdit && !filtersApplied
              ? { label: 'Registrar persona', onClick: () => setCreating(true) }
              : undefined
          }
        />
      )}

      <PersonForm
        open={creating}
        person={null}
        onClose={() => setCreating(false)}
        onSaved={(person) => {
          setCreating(false);
          invalidatePrefix('people:');
          navigate(`/personas/${person.id}`);
        }}
      />
    </>
  );
}
