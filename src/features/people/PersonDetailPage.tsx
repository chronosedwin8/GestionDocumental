import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CalendarClock,
  FileText,
  FolderOpen,
  IdCard,
  Pencil,
  Plus,
  UserRound,
} from 'lucide-react';
import * as peopleApi from '@/api/people';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { useFeature } from '@/hooks/useFeature';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Expediente } from '@/types/api';
import { CompletenessMeter } from './CompletenessMeter';
import { PersonEventForm } from './PersonEventForm';
import { PersonForm } from './PersonForm';
import { usePersonFileLabels } from './usePersonFiles';

type TabId = 'datos' | 'expedientes' | 'documentos' | 'linea';

const ESTADO_COLOR: Record<Expediente['estado'], string> = {
  ABIERTO: 'var(--color-success)',
  CERRADO: 'var(--color-warning)',
  TRANSFERIDO: 'var(--color-info)',
};

function DataRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0 border-b border-line py-2 last:border-b-0">
      <dt className="text-[10px] uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className="truncate text-sm text-content-secondary">{value}</dd>
    </div>
  );
}

/** Ficha de persona con pestañas (U6): datos, expedientes, documentos y seguimiento. */
export default function PersonDetailPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const { personTypeLabel, moduleLabel, moduleColor, statusLabel, statusColor } = useCatalogs();
  const { hasFullAccess, canManageUsers } = useAuth();
  const { fileLabel } = usePersonFileLabels();

  const [tab, setTab] = useState<TabId>('datos');
  const [editing, setEditing] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [periodFilter, setPeriodFilter] = useState('');

  const canManagePeople = useFeature('PEOPLE_MANAGE');
  const canEdit = (hasFullAccess || canManageUsers) && canManagePeople;

  const person = useQuery(id ? `person:${id}` : null, (signal) => peopleApi.getPerson(id, signal));
  const expedientes = useQuery(id ? `person:${id}:expedientes` : null, (signal) =>
    peopleApi.listPersonExpedientes(id, signal),
  );
  const documents = useQuery(id ? `person:${id}:documents` : null, (signal) =>
    peopleApi.listPersonDocuments(id, signal),
  );
  const events = useQuery(id ? `person:${id}:events` : null, (signal) =>
    peopleApi.listPersonEvents(id, signal),
  );
  const periods = useQuery('academic-periods', (signal) => peopleApi.listAcademicPeriods(signal), {
    staleTime: 300_000,
  });

  const expedienteList = useMemo(() => expedientes.data ?? [], [expedientes.data]);
  const documentList = useMemo(() => documents.data?.data ?? [], [documents.data]);
  const eventList = useMemo(() => events.data ?? [], [events.data]);
  const periodList = useMemo(() => periods.data ?? [], [periods.data]);

  const periodName = (periodId: string | null): string =>
    periodList.find((entry) => entry.id === periodId)?.name ?? '—';

  const label = fileLabel(person.data?.type_code, expedienteList);

  // Filtro por periodo: sobre listas completas que devuelve el servidor.
  const usesPeriods =
    periodList.length > 0 &&
    (expedienteList.some((exp) => exp.academic_period_id !== null) ||
      documentList.some((doc) => doc.academic_period_id !== null));

  const filteredExpedientes = periodFilter
    ? expedienteList.filter((exp) => exp.academic_period_id === periodFilter)
    : expedienteList;
  const filteredDocuments = periodFilter
    ? documentList.filter((doc) => doc.academic_period_id === periodFilter)
    : documentList;

  if (person.error) {
    // `GET /people/:id` responde 404 tanto si la persona no existe como si el
    // usuario no tiene ninguna dependencia legible (CONTRACT_NOTES §9): el
    // servidor no distingue los dos casos y la interfaz tampoco lo inventa.
    if (person.error.code === 'NOT_FOUND') {
      return (
        <>
          <PageHeader title="Persona" icon={<UserRound className="h-5 w-5 text-acid" aria-hidden />} />
          <EmptyState
            title="Ficha no disponible"
            description="Esta persona no existe o no tienes acceso a las dependencias donde está su información."
            action={{ label: 'Volver a personas', to: '/personas' }}
          />
        </>
      );
    }
    return (
      <>
        <PageHeader title="Persona" icon={<UserRound className="h-5 w-5 text-acid" aria-hidden />} />
        <ApiErrorState error={person.error} onRetry={() => void person.refetch()} />
      </>
    );
  }

  if (person.loading || !person.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const data = person.data;

  const periodSelect = usesPeriods ? (
    <Select
      className="w-56"
      aria-label="Filtrar por periodo académico"
      placeholder="Todos los periodos"
      value={periodFilter}
      onChange={(e) => setPeriodFilter(e.target.value)}
      options={periodList.map((entry) => ({
        value: entry.id,
        label: entry.is_current ? `${entry.name} (actual)` : entry.name,
      }))}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title={data.full_name}
        description={`${personTypeLabel(data.type_code)} · documento ${data.document_number}`}
        icon={<UserRound className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[
          { label: 'Inicio', to: '/' },
          { label: 'Personas', to: '/personas' },
          { label: data.full_name },
        ]}
        actions={
          <>
            <Badge color={data.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-danger)'}>
              {data.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </Badge>
            <HelpButton slug="primeros-pasos" contextLabel={label} label={`Ayuda sobre ${label}`} />
            {canEdit && (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
          </>
        }
      />

      <section className="panel mb-5" aria-labelledby="completitud-title">
        <h2 id="completitud-title" className="mb-3 flex items-center gap-2 font-display text-base text-content-primary">
          <IdCard className="h-4 w-4 text-acid" aria-hidden />
          {label} — completitud documental
        </h2>
        <CompletenessMeter completeness={data.completeness} fileLabel={label} />
      </section>

      <Tabs
        className="mb-4"
        ariaLabel="Secciones de la persona"
        value={tab}
        onChange={(next) => setTab(next as TabId)}
        items={[
          { id: 'datos', label: 'Datos', icon: <IdCard className="h-3.5 w-3.5" aria-hidden /> },
          {
            id: 'expedientes',
            label: 'Expedientes',
            icon: <FolderOpen className="h-3.5 w-3.5" aria-hidden />,
            badge: expedienteList.length,
          },
          {
            id: 'documentos',
            label: 'Documentos',
            icon: <FileText className="h-3.5 w-3.5" aria-hidden />,
            badge: documents.data?.total ?? 0,
          },
          {
            id: 'linea',
            label: 'Línea de tiempo',
            icon: <CalendarClock className="h-3.5 w-3.5" aria-hidden />,
            badge: eventList.length,
          },
        ]}
      />

      <TabPanel id="datos" active={tab === 'datos'}>
        <div className="panel">
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <DataRow label="Nombres" value={data.first_name} />
            <DataRow label="Apellidos" value={data.last_name} />
            <DataRow label="Tipo de persona" value={personTypeLabel(data.type_code)} />
            <DataRow label="Número de documento" value={data.document_number} />
            <DataRow label="Correo electrónico" value={data.email ?? '—'} />
            <DataRow label="Teléfono" value={data.phone ?? '—'} />
            <DataRow label="Fecha de nacimiento" value={formatDate(data.birth_date)} />
            <DataRow label="Cargo" value={data.position ?? '—'} />
            <DataRow label="Grado o curso" value={data.grade ?? '—'} />
            <DataRow label="Fecha de vinculación" value={formatDate(data.hire_date)} />
            <DataRow label="Fecha de retiro" value={formatDate(data.termination_date)} />
            <DataRow label="Registrada el" value={formatDateTime(data.created_at)} />
          </dl>
        </div>
      </TabPanel>

      <TabPanel id="expedientes" active={tab === 'expedientes'}>
        <div className="space-y-3">
          {periodSelect && <div className="flex justify-end">{periodSelect}</div>}
          {expedientes.error ? (
            <ApiErrorState error={expedientes.error} onRetry={() => void expedientes.refetch()} />
          ) : filteredExpedientes.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-8 w-8" />}
              title={periodFilter ? 'Sin expedientes en ese periodo' : 'Sin expedientes'}
              description={
                periodFilter
                  ? 'Cambia el periodo académico para ver otros expedientes.'
                  : 'El servidor abre el expediente automáticamente al registrar empleados y estudiantes; créalo a mano si hace falta.'
              }
              action={{ label: 'Ir a expedientes', to: '/expedientes' }}
            />
          ) : (
            <ul className="space-y-2">
              {filteredExpedientes.map((exp) => (
                <li key={exp.id}>
                  <Link
                    to={`/expedientes/${exp.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-raised p-3 no-underline transition-colors hover:border-acid-border hover:no-underline"
                  >
                    <span className="font-mono text-xs text-acid">{exp.radicado}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-content-primary">{exp.titulo}</span>
                    <Badge color={moduleColor(exp.module_code)}>{moduleLabel(exp.module_code)}</Badge>
                    {exp.academic_period_id && <Badge>{periodName(exp.academic_period_id)}</Badge>}
                    <Badge color={ESTADO_COLOR[exp.estado]}>{exp.estado}</Badge>
                    <span className="text-[11px] text-content-muted">
                      Apertura {formatDate(exp.fecha_apertura)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabPanel>

      <TabPanel id="documentos" active={tab === 'documentos'}>
        <div className="space-y-3">
          {periodSelect && <div className="flex justify-end">{periodSelect}</div>}
          {documents.error ? (
            <ApiErrorState error={documents.error} onRetry={() => void documents.refetch()} />
          ) : filteredDocuments.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title={periodFilter ? 'Sin documentos en ese periodo' : 'Sin documentos asociados'}
              description="Al cargar un documento puedes vincularlo a esta persona desde el asistente de carga."
            />
          ) : (
            <ul className="space-y-2">
              {filteredDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to={`/documentos/${doc.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-raised p-3 no-underline transition-colors hover:border-acid-border hover:no-underline"
                  >
                    <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-content-primary">{doc.title}</span>
                    <span className="text-[11px] text-content-muted">{doc.type}</span>
                    {doc.folio_index ? (
                      <Badge>Folio {doc.folio_index}</Badge>
                    ) : (
                      <Badge color="var(--color-warning)">Sin foliar</Badge>
                    )}
                    <Badge color={statusColor(doc.status_code)}>{statusLabel(doc.status_code)}</Badge>
                    {doc.academic_period_id && <Badge>{periodName(doc.academic_period_id)}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {documents.data && documents.data.total > documentList.length && (
            <p className="text-[11px] text-content-muted">
              Se muestran {documentList.length} de {documents.data.total} documentos que devuelve el
              servidor para esta persona.
            </p>
          )}
        </div>
      </TabPanel>

      <TabPanel id="linea" active={tab === 'linea'}>
        <div className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingEvent(true)}>
                Registrar evento
              </Button>
            </div>
          )}

          {events.error ? (
            <ApiErrorState error={events.error} onRetry={() => void events.refetch()} />
          ) : eventList.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-8 w-8" />}
              title="Sin eventos de seguimiento"
              description="Registra ingresos, evaluaciones, matrículas, promociones o retiros para construir la trazabilidad."
              action={canEdit ? { label: 'Registrar evento', onClick: () => setAddingEvent(true) } : undefined}
            />
          ) : (
            <ol className="relative space-y-3 border-l border-line pl-5">
              {eventList.map((event) => (
                <li key={event.id} className="relative">
                  <span
                    className="absolute -left-[26px] top-2 h-2.5 w-2.5 rounded-full bg-acid"
                    aria-hidden
                  />
                  <div className="rounded-card border border-line bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{event.event_type}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-primary">
                        {event.title}
                      </span>
                      <span className="whitespace-nowrap text-[11px] text-content-muted">
                        {formatDate(event.event_date)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="mt-1.5 whitespace-pre-line text-xs text-content-secondary">
                        {event.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-content-muted">
                      Registrado por {event.created_by_user?.full_name ?? '—'} el{' '}
                      {formatDateTime(event.created_at)}
                    </p>
                    {event.document_id && (
                      <Link
                        to={`/documentos/${event.document_id}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-acid no-underline hover:underline"
                      >
                        <FileText className="h-3 w-3" aria-hidden />
                        Ver documento vinculado
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </TabPanel>

      <PersonForm
        open={editing}
        person={data}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          invalidatePrefix(`person:${id}`);
          invalidatePrefix('people:');
          void person.refetch();
        }}
      />

      <PersonEventForm
        open={addingEvent}
        personId={id}
        documents={documentList}
        knownTypes={eventList.map((event) => event.event_type)}
        onClose={() => setAddingEvent(false)}
        onCreated={() => {
          setAddingEvent(false);
          invalidatePrefix(`person:${id}:events`);
          void events.refetch();
          void person.refetch();
        }}
      />
    </>
  );
}
