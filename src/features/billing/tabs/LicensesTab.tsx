import { useMemo, useState } from 'react';
import { CalendarClock, Package, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import * as billingApi from '@/api/billing';
import { ApiError } from '@/api/client';
import { useDialogs } from '@/contexts/DialogContext';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { IfFeature } from '@/components/ui/IfFeature';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate, todayInput } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { LICENSE_STATUS_OPTIONS, billingPeriodLabel, licenseStatus } from '../labels';
import type { Client, License, LicensePlan } from '@/types/api';
import type { Column } from '@/types/ui';

export interface LicensesTabProps {
  clients: Client[];
  plans: LicensePlan[];
  plansError: boolean;
  onPlansChanged: () => void;
}

interface LicenseForm {
  id: string | null;
  client_id: string;
  plan_code: string;
  start_date: string;
  end_date: string;
  seats: string;
  storage_gb: string;
  price_amount: string;
  auto_renew: boolean;
  notes: string;
}

export function LicensesTab({
  clients,
  plans,
  plansError,
  onPlansChanged,
}: LicensesTabProps): React.JSX.Element {
  const { confirm } = useDialogs();
  const pagination = usePagination({ initialSort: 'start_date', initialOrder: 'desc' });
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<LicenseForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [pagination.page, pagination.pageSize, pagination.sort, pagination.order, statusFilter],
  );

  const licenses = useQuery(`billing:licenses:${JSON.stringify(query)}`, (signal) =>
    billingApi.listLicenses(query, signal),
  );

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.client_id || !form.plan_code) {
      toast.error('Cliente y plan son obligatorios.');
      return;
    }
    setSaving(true);
    const payload = {
      client_id: form.client_id,
      plan_code: form.plan_code,
      start_date: form.start_date,
      end_date: form.end_date || null,
      seats: form.seats === '' ? null : Number(form.seats),
      storage_gb: form.storage_gb === '' ? null : Number(form.storage_gb),
      price_amount: form.price_amount === '' ? null : Number(form.price_amount),
      auto_renew: form.auto_renew,
      notes: form.notes.trim() || null,
    };
    try {
      if (form.id) await billingApi.updateLicense(form.id, payload);
      else await billingApi.createLicense(payload);
      toast.success(form.id ? 'Licencia actualizada.' : 'Licencia contratada.');
      setForm(null);
      invalidatePrefix('billing:');
      await licenses.refetch();
      onPlansChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la licencia.');
    } finally {
      setSaving(false);
    }
  };

  const renew = async (license: License): Promise<void> => {
    const ok = await confirm({
      title: 'Renovar licencia',
      message:
        'La licencia se prorroga según el periodo del plan. Las fechas nuevas las calcula el servidor.',
      confirmLabel: 'Renovar',
    });
    if (!ok) return;
    setBusyId(license.id);
    try {
      const updated = await billingApi.renewLicense(license.id);
      toast.success(`Licencia renovada hasta ${formatDate(updated.end_date)}.`);
      invalidatePrefix('billing:');
      await licenses.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo renovar la licencia.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<Column<License>[]>(
    () => [
      {
        key: 'client',
        header: 'Cliente',
        primary: true,
        required: true,
        render: (license) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">
              {license.client_name ?? license.client_id}
            </p>
            <p className="truncate text-[11px] text-content-muted">
              {license.plan_name ?? license.plan_code}
            </p>
          </div>
        ),
      },
      {
        key: 'period',
        header: 'Vigencia',
        sortField: 'start_date',
        render: (license) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {formatDate(license.start_date)} → {formatDate(license.end_date)}
          </span>
        ),
      },
      {
        key: 'seats',
        header: 'Usuarios',
        render: (license) => (
          <span className="text-xs text-content-secondary">
            {license.seats === null ? 'Ilimitados' : license.seats}
          </span>
        ),
      },
      {
        key: 'storage',
        header: 'Almacenamiento',
        render: (license) => (
          <span className="text-xs text-content-secondary">
            {license.storage_gb === null ? 'Ilimitado' : `${license.storage_gb} GB`}
          </span>
        ),
      },
      {
        key: 'price',
        header: 'Precio',
        render: (license) => (
          <span className="font-mono text-xs text-content-primary">
            {formatMoney(license.price_amount, license.currency, { emptyLabel: 'A la medida' })}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        sortField: 'status',
        render: (license) => {
          const status = licenseStatus(license.status);
          return (
            <div className="flex flex-wrap gap-1">
              <Badge color={status.color}>{status.label}</Badge>
              {license.auto_renew && <Badge color="var(--color-info)">Auto</Badge>}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <section className="panel">
        <h3 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <Package className="h-4 w-4 text-acid" aria-hidden />
          Planes contratables
        </h3>
        {plansError ? (
          <EmptyState
            title="No se pudo leer el catálogo de planes"
            description="GET /license-plans no respondió. Los planes son la fuente única del sitio público: no se muestran precios inventados."
          />
        ) : plans.length === 0 ? (
          <EmptyState
            title="Sin planes registrados"
            description="El catálogo de planes está vacío. Créalos para poder contratar licencias y cotizar."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.code} className="rounded-lg border border-line bg-surface-sunken p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-content-primary">{plan.name}</p>
                    <p className="font-mono text-[10px] text-content-muted">{plan.code}</p>
                  </div>
                  {!plan.is_active && <Badge color="var(--text-muted)">Inactivo</Badge>}
                </div>
                <p className="mt-2 font-mono text-base text-acid">
                  {formatMoney(plan.price_amount, plan.currency, { emptyLabel: 'Precio a la medida' })}
                </p>
                <p className="text-[11px] text-content-muted">
                  {billingPeriodLabel(plan.billing_period)} ·{' '}
                  {plan.max_users === null ? 'usuarios ilimitados' : `${plan.max_users} usuarios`} ·{' '}
                  {plan.storage_gb === null ? 'almacenamiento ilimitado' : `${plan.storage_gb} GB`}
                </p>
                {plan.description && (
                  <p className="mt-1 text-[11px] text-content-secondary">{plan.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toolbar ariaLabel="Filtros de licencias">
        <span className="flex items-center gap-1.5 text-xs text-content-muted">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Licencias contratadas
        </span>
        <Select
          className="w-48"
          aria-label="Filtrar licencias por estado"
          placeholder="Todos los estados"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={LICENSE_STATUS_OPTIONS}
        />
        <div className="flex-1" />
        <IfFeature code="LICENSE_MANAGE">
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            disabled={plans.length === 0}
            title={plans.length === 0 ? 'Primero debe existir al menos un plan' : undefined}
            onClick={() =>
              setForm({
                id: null,
                client_id: clients[0]?.id ?? '',
                plan_code: plans[0]?.code ?? '',
                start_date: todayInput(),
                end_date: '',
                seats: '',
                storage_gb: '',
                price_amount: '',
                auto_renew: false,
                notes: '',
              })
            }
          >
            Contratar licencia
          </Button>
        </IfFeature>
      </Toolbar>

      {licenses.error ? (
        <ApiErrorState error={licenses.error} onRetry={() => void licenses.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={licenses.data?.data ?? []}
          rowKey={(license) => license.id}
          loading={licenses.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={licenses.data?.page ?? pagination.page}
          pageSize={licenses.data?.pageSize ?? pagination.pageSize}
          total={licenses.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin licencias contratadas"
          emptyDescription="Ningún cliente tiene una licencia registrada todavía."
          caption="Licencias por cliente"
          rowActions={(license) => (
            <IfFeature code="LICENSE_MANAGE">
              <Button
                size="sm"
                variant="outline"
                loading={busyId === license.id}
                onClick={() => void renew(license)}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Renovar
              </Button>
            </IfFeature>
          )}
        />
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          size="lg"
          title={form.id ? 'Editar licencia' : 'Contratar licencia'}
          description="Deja vacíos usuarios, almacenamiento o precio para heredar lo del plan."
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Cliente" required>
                <Select
                  data-autofocus
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  placeholder="Selecciona un cliente"
                  options={clients.map((client) => ({ value: client.id, label: client.name }))}
                />
              </FormField>
              <FormField label="Plan" required>
                <Select
                  value={form.plan_code}
                  onChange={(e) => setForm({ ...form, plan_code: e.target.value })}
                  placeholder="Selecciona un plan"
                  options={plans.map((plan) => ({ value: plan.code, label: plan.name }))}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Inicio" required>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </FormField>
              <FormField label="Fin">
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Usuarios" hint="Vacío = los del plan">
                <Input
                  type="number"
                  min={1}
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: e.target.value })}
                />
              </FormField>
              <FormField label="Almacenamiento (GB)" hint="Vacío = el del plan">
                <Input
                  type="number"
                  min={1}
                  value={form.storage_gb}
                  onChange={(e) => setForm({ ...form, storage_gb: e.target.value })}
                />
              </FormField>
              <FormField label="Precio" hint="Vacío = el del plan">
                <Input
                  type="number"
                  min={0}
                  value={form.price_amount}
                  onChange={(e) => setForm({ ...form, price_amount: e.target.value })}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-xs text-content-secondary">
              <input
                type="checkbox"
                className="accent-[color:var(--color-acid)]"
                checked={form.auto_renew}
                onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })}
              />
              Renovación automática
            </label>
            <FormField label="Notas">
              <Textarea
                rows={2}
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
