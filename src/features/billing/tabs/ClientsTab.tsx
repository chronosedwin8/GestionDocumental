import { useMemo, useState } from 'react';
import { Building2, Eye, Pencil, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import * as billingApi from '@/api/billing';
import { ApiError } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { IfFeature } from '@/components/ui/IfFeature';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate } from '@/lib/format';
import { ClientDetail } from '../ClientDetail';
import { CLIENT_STATUS_OPTIONS, clientStatus } from '../labels';
import type { Client } from '@/types/api';
import type { Column } from '@/types/ui';

interface ClientForm {
  id: string | null;
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  tax_regime: string;
  address: string;
  city: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: ClientForm = {
  id: null,
  name: '',
  legal_name: '',
  document_type: 'NIT',
  document_number: '',
  tax_regime: '',
  address: '',
  city: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  status: 'PROSPECT',
  notes: '',
};

export function ClientsTab(): React.JSX.Element {
  const pagination = usePagination({ initialSort: 'name', initialOrder: 'asc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [statusFilter, setStatusFilter] = useState('');
  const [openClient, setOpenClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [pagination.page, pagination.pageSize, pagination.sort, pagination.order, debounced, statusFilter],
  );

  const clients = useQuery(`billing:clients:${JSON.stringify(query)}`, (signal) =>
    billingApi.listClients(query, signal),
  );

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('El nombre del cliente es obligatorio.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      document_type: form.document_type.trim() || null,
      document_number: form.document_number.trim() || null,
      tax_regime: form.tax_regime.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      status: form.status as Client['status'],
      notes: form.notes.trim() || null,
    };
    try {
      if (form.id) await billingApi.updateClient(form.id, payload);
      else await billingApi.createClient(payload);
      toast.success(form.id ? 'Cliente actualizado.' : 'Cliente creado.');
      setForm(null);
      await clients.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el cliente.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<Column<Client>[]>(
    () => [
      {
        key: 'name',
        header: 'Cliente',
        sortField: 'name',
        primary: true,
        required: true,
        render: (client) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{client.name}</p>
            <p className="truncate text-[11px] text-content-muted">{client.legal_name ?? '—'}</p>
          </div>
        ),
      },
      {
        key: 'document',
        header: 'Identificación',
        render: (client) => (
          <span className="font-mono text-xs text-content-secondary">
            {client.document_number ? `${client.document_type ?? ''} ${client.document_number}` : '—'}
          </span>
        ),
      },
      {
        key: 'contact',
        header: 'Contacto',
        render: (client) => (
          <span className="text-xs text-content-secondary">
            {client.contact_name ?? client.contact_email ?? '—'}
          </span>
        ),
      },
      {
        key: 'city',
        header: 'Ciudad',
        render: (client) => <span className="text-xs text-content-secondary">{client.city ?? '—'}</span>,
      },
      {
        key: 'status',
        header: 'Estado',
        sortField: 'status',
        render: (client) => {
          const status = clientStatus(client.status);
          return <Badge color={status.color}>{status.label}</Badge>;
        },
      },
      {
        key: 'created',
        header: 'Alta',
        sortField: 'created_at',
        render: (client) => (
          <span className="whitespace-nowrap text-xs text-content-muted">
            {formatDate(client.created_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de clientes">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar por nombre o identificación…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar clientes"
        />
        <Select
          className="w-48"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={CLIENT_STATUS_OPTIONS}
        />
        <div className="flex-1" />
        <IfFeature code="CLIENT_MANAGE">
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setForm({ ...EMPTY_FORM })}
          >
            Nuevo cliente
          </Button>
        </IfFeature>
      </Toolbar>

      {clients.error ? (
        <ApiErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={clients.data?.data ?? []}
          rowKey={(client) => client.id}
          loading={clients.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={clients.data?.page ?? pagination.page}
          pageSize={clients.data?.pageSize ?? pagination.pageSize}
          total={clients.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin clientes registrados"
          emptyDescription="Todavía no hay instituciones clientes. Crea la primera para empezar a registrar licencias y facturas."
          caption="Clientes de EduArchive"
          onRowClick={(client) => setOpenClient(client)}
          rowActions={(client) => (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Ver la vista de 360° de ${client.name}`}
                onClick={() => setOpenClient(client)}
                icon={<Eye className="h-4 w-4" />}
              />
              <IfFeature code="CLIENT_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${client.name}`}
                  onClick={() =>
                    setForm({
                      id: client.id,
                      name: client.name,
                      legal_name: client.legal_name ?? '',
                      document_type: client.document_type ?? 'NIT',
                      document_number: client.document_number ?? '',
                      tax_regime: client.tax_regime ?? '',
                      address: client.address ?? '',
                      city: client.city ?? '',
                      contact_name: client.contact_name ?? '',
                      contact_email: client.contact_email ?? '',
                      contact_phone: client.contact_phone ?? '',
                      status: client.status,
                      notes: client.notes ?? '',
                    })
                  }
                  icon={<Pencil className="h-4 w-4" />}
                />
              </IfFeature>
            </>
          )}
        />
      )}

      {openClient && (
        <Dialog
          open
          onClose={() => setOpenClient(null)}
          size="xl"
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-acid" aria-hidden />
              {openClient.name}
            </span>
          }
          description="Vista de 360°: licencia vigente, totales, cotizaciones, facturas y pagos."
          footer={
            <Button variant="ghost" onClick={() => setOpenClient(null)}>
              Cerrar
            </Button>
          }
        >
          <ClientDetail clientId={openClient.id} />
        </Dialog>
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          size="lg"
          title={form.id ? 'Editar cliente' : 'Nuevo cliente'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <FormField label="Nombre" required>
              <Input
                data-autofocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Razón social">
              <Input
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Tipo de documento">
                <Input
                  value={form.document_type}
                  onChange={(e) => setForm({ ...form, document_type: e.target.value })}
                />
              </FormField>
              <FormField label="Número">
                <Input
                  value={form.document_number}
                  onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                />
              </FormField>
              <FormField label="Régimen tributario">
                <Input
                  value={form.tax_regime}
                  onChange={(e) => setForm({ ...form, tax_regime: e.target.value })}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Dirección">
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </FormField>
              <FormField label="Ciudad">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Contacto">
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </FormField>
              <FormField label="Correo de contacto">
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </FormField>
              <FormField label="Teléfono de contacto">
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label="Estado">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={CLIENT_STATUS_OPTIONS}
              />
            </FormField>
            <FormField label="Notas">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
