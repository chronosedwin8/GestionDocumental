import { useMemo, useState } from 'react';
import { Ban, Banknote, Download, Pencil, Plus, Receipt, Search, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import * as billingApi from '@/api/billing';
import { ApiError } from '@/api/client';
import { useDialogs } from '@/contexts/DialogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
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
import { formatDate, todayInput } from '@/lib/format';
import { formatMoney, formatTaxRate, toAmount } from '@/lib/money';
import { LineItemsEditor, EMPTY_LINE } from '../LineItemsEditor';
import {
  DIAN_NOTICE,
  INVOICE_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  invoiceStatus,
} from '../labels';
import type { Client, CommercialItemInput, Invoice, LicensePlan } from '@/types/api';
import type { Column } from '@/types/ui';

interface InvoiceForm {
  id: string | null;
  client_id: string;
  issue_date: string;
  due_date: string;
  tax_rate: string;
  notes: string;
  items: CommercialItemInput[];
}

interface PaymentForm {
  invoice: Invoice;
  payment_date: string;
  amount: string;
  method: string;
  reference: string;
  notes: string;
}

export interface InvoicesTabProps {
  clients: Client[];
  plans: LicensePlan[];
  defaults: { tax_rate: number | null; payment_terms_days: number | null };
}

export function InvoicesTab({ clients, plans, defaults }: InvoicesTabProps): React.JSX.Element {
  const { confirm, promptText } = useDialogs();
  const pagination = usePagination({ initialSort: 'issue_date', initialOrder: 'desc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<InvoiceForm | null>(null);
  const [payment, setPayment] = useState<PaymentForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const invoices = useQuery(`billing:invoices:${JSON.stringify(query)}`, (signal) =>
    billingApi.listInvoices(query, signal),
  );

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.client_id) {
      toast.error('Selecciona el cliente de la factura.');
      return;
    }
    if (form.items.length === 0 || form.items.some((item) => !item.description.trim())) {
      toast.error('Cada línea necesita una descripción.');
      return;
    }
    setSaving(true);
    const payload = {
      client_id: form.client_id,
      issue_date: form.issue_date,
      due_date: form.due_date || null,
      ...(form.tax_rate !== '' ? { tax_rate: Number(form.tax_rate) } : {}),
      notes: form.notes.trim() || null,
      items: form.items.map((item, index) => ({ ...item, position: index + 1 })),
    };
    try {
      if (form.id) await billingApi.updateInvoice(form.id, payload);
      else await billingApi.createInvoice(payload);
      toast.success(form.id ? 'Factura actualizada.' : 'Factura creada en borrador.');
      setForm(null);
      invalidatePrefix('billing:');
      await invoices.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la factura.');
    } finally {
      setSaving(false);
    }
  };

  const issue = async (invoice: Invoice): Promise<void> => {
    const ok = await confirm({
      title: 'Emitir factura',
      message:
        'Al emitir se asigna el consecutivo definitivo y la factura deja de ser un borrador. El consecutivo no se reutiliza.',
      confirmLabel: 'Emitir',
    });
    if (!ok) return;
    setBusyId(invoice.id);
    try {
      const result = await billingApi.issueInvoice(invoice.id);
      toast.success(`Factura emitida${result.number ? `: ${result.number}` : ''}.`);
      invalidatePrefix('billing:');
      await invoices.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo emitir la factura.');
    } finally {
      setBusyId(null);
    }
  };

  const voidInvoice = async (invoice: Invoice): Promise<void> => {
    const reason = await promptText({
      title: 'Anular factura',
      message: `${invoice.number ?? 'La factura'} conservará su consecutivo y quedará registrada como anulada.`,
      label: 'Motivo de la anulación',
      placeholder: 'Describe por qué se anula…',
      tone: 'danger',
      confirmLabel: 'Anular',
      required: true,
    });
    if (!reason) return;
    setBusyId(invoice.id);
    try {
      await billingApi.voidInvoice(invoice.id, reason);
      toast.success('Factura anulada.');
      invalidatePrefix('billing:');
      await invoices.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo anular la factura.');
    } finally {
      setBusyId(null);
    }
  };

  const registerPayment = async (): Promise<void> => {
    if (!payment) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('El importe del pago debe ser mayor que cero.');
      return;
    }
    setSaving(true);
    try {
      await billingApi.createPayment({
        invoice_id: payment.invoice.id,
        payment_date: payment.payment_date,
        amount,
        method: payment.method,
        reference: payment.reference.trim() || null,
        notes: payment.notes.trim() || null,
      });
      // El saldo lo recalcula el disparador del servidor: se relee la factura.
      const updated = await billingApi.getInvoice(payment.invoice.id);
      toast.success(
        `Pago registrado. Saldo de la factura: ${formatMoney(updated.balance, updated.currency)}.`,
      );
      setPayment(null);
      invalidatePrefix('billing:');
      await invoices.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async (invoice: Invoice): Promise<void> => {
    try {
      await billingApi.downloadInvoicePdf(invoice.id, invoice.number);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el PDF.');
    }
  };

  const columns = useMemo<Column<Invoice>[]>(
    () => [
      {
        key: 'number',
        header: 'Factura',
        sortField: 'number',
        primary: true,
        required: true,
        render: (invoice) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-content-primary">
              {invoice.number ?? 'Borrador'}
            </p>
            <p className="truncate text-[11px] text-content-muted">
              {invoice.client_name ?? invoice.client_id}
            </p>
          </div>
        ),
      },
      {
        key: 'issue',
        header: 'Emisión',
        sortField: 'issue_date',
        render: (invoice) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {formatDate(invoice.issue_date)}
          </span>
        ),
      },
      {
        key: 'due',
        header: 'Vencimiento',
        sortField: 'due_date',
        render: (invoice) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {formatDate(invoice.due_date)}
          </span>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        render: (invoice) => (
          <span className="font-mono text-xs text-content-primary">
            {formatMoney(invoice.total, invoice.currency)}
          </span>
        ),
      },
      {
        key: 'balance',
        header: 'Saldo',
        render: (invoice) => {
          const balance = toAmount(invoice.balance) ?? 0;
          return (
            <span
              className="font-mono text-xs"
              style={{ color: balance > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}
            >
              {formatMoney(invoice.balance, invoice.currency)}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Estado',
        sortField: 'status',
        render: (invoice) => {
          const status = invoiceStatus(invoice.status);
          return (
            <div className="flex flex-wrap gap-1">
              <Badge color={status.color}>{status.label}</Badge>
              {invoice.void_reason && (
                <span className="text-[10px] text-content-muted" title={invoice.void_reason}>
                  motivo registrado
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de facturas">
        <Input
          className="min-w-[200px] flex-1"
          placeholder="Buscar por número o cliente…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar facturas"
        />
        <Select
          className="w-44"
          aria-label="Filtrar por estado"
          placeholder="Todos los estados"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={INVOICE_STATUS_OPTIONS}
        />
        <div className="flex-1" />
        <IfFeature code="INVOICE_MANAGE">
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setForm({
                id: null,
                client_id: clients[0]?.id ?? '',
                issue_date: todayInput(),
                due_date: defaults.payment_terms_days ? todayInput(defaults.payment_terms_days) : '',
                tax_rate: defaults.tax_rate !== null ? String(defaults.tax_rate) : '',
                notes: '',
                items: [{ ...EMPTY_LINE }],
              })
            }
          >
            Nueva factura
          </Button>
        </IfFeature>
      </Toolbar>

      {invoices.error ? (
        <ApiErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={invoices.data?.data ?? []}
          rowKey={(invoice) => invoice.id}
          loading={invoices.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={invoices.data?.page ?? pagination.page}
          pageSize={invoices.data?.pageSize ?? pagination.pageSize}
          total={invoices.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin facturas"
          emptyDescription="Las facturas nacen como borrador; al emitirlas reciben su consecutivo."
          caption="Facturas"
          rowActions={(invoice) => (
            <>
              <IfFeature code="INVOICE_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${invoice.number ?? 'la factura'}`}
                  disabled={busyId === invoice.id || invoice.status === 'PAID' || invoice.status === 'VOID'}
                  title={
                    invoice.status === 'PAID' || invoice.status === 'VOID'
                      ? 'Una factura pagada o anulada no admite cambios'
                      : 'Editar'
                  }
                  onClick={() =>
                    setForm({
                      id: invoice.id,
                      client_id: invoice.client_id,
                      issue_date: invoice.issue_date,
                      due_date: invoice.due_date ?? '',
                      tax_rate: String(invoice.tax_rate ?? ''),
                      notes: invoice.notes ?? '',
                      items:
                        invoice.items?.map((item) => ({
                          description: item.description,
                          plan_code: item.plan_code,
                          quantity: Number(item.quantity),
                          unit_price: Number(item.unit_price),
                        })) ?? [{ ...EMPTY_LINE }],
                    })
                  }
                  icon={<Pencil className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="INVOICE_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Emitir ${invoice.number ?? 'la factura'}`}
                  disabled={busyId === invoice.id || invoice.status !== 'DRAFT'}
                  title={invoice.status === 'DRAFT' ? 'Emitir' : 'Solo se emiten los borradores'}
                  onClick={() => void issue(invoice)}
                  icon={<Send className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="PAYMENT_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Registrar un pago de ${invoice.number ?? 'la factura'}`}
                  disabled={
                    busyId === invoice.id ||
                    invoice.status === 'VOID' ||
                    invoice.status === 'PAID' ||
                    invoice.status === 'DRAFT'
                  }
                  title={
                    invoice.status === 'DRAFT'
                      ? 'Emite la factura antes de registrar pagos'
                      : 'Registrar pago'
                  }
                  onClick={() =>
                    setPayment({
                      invoice,
                      payment_date: todayInput(),
                      amount: String(toAmount(invoice.balance) ?? ''),
                      method: PAYMENT_METHOD_OPTIONS[0]?.value ?? 'TRANSFER',
                      reference: '',
                      notes: '',
                    })
                  }
                  icon={<Banknote className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="INVOICE_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Anular ${invoice.number ?? 'la factura'}`}
                  disabled={busyId === invoice.id || invoice.status === 'VOID'}
                  onClick={() => void voidInvoice(invoice)}
                  icon={<Ban className="h-4 w-4 text-state-danger" />}
                />
              </IfFeature>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Descargar el PDF de ${invoice.number ?? 'la factura'}`}
                onClick={() => void downloadPdf(invoice)}
                icon={<Download className="h-4 w-4" />}
              />
            </>
          )}
        />
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          size="lg"
          title={
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-acid" aria-hidden />
              {form.id ? 'Editar factura' : 'Nueva factura'}
            </span>
          }
          description="Se guarda como borrador; el consecutivo se asigna al emitirla."
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
            <FormField label="Cliente" required>
              <Select
                data-autofocus
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                placeholder="Selecciona un cliente"
                options={clients.map((client) => ({ value: client.id, label: client.name }))}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Fecha de emisión">
                <Input
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                />
              </FormField>
              <FormField label="Vencimiento">
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </FormField>
              <FormField
                label="Impuesto"
                hint={
                  defaults.tax_rate !== null
                    ? `Por defecto ${formatTaxRate(defaults.tax_rate)} según el servidor.`
                    : 'El servidor no publicó un impuesto por defecto.'
                }
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.tax_rate}
                  onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                />
              </FormField>
            </div>

            <LineItemsEditor
              items={form.items}
              plans={plans}
              onChange={(items) => setForm({ ...form, items })}
            />

            <FormField label="Notas">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>

            <p className="text-[10px] text-content-muted">{DIAN_NOTICE}</p>
          </div>
        </Dialog>
      )}

      {payment && (
        <Dialog
          open
          onClose={() => setPayment(null)}
          dismissable={!saving}
          title={`Registrar pago · ${payment.invoice.number ?? 'factura'}`}
          description={`Saldo actual: ${formatMoney(
            payment.invoice.balance,
            payment.invoice.currency,
          )}. El nuevo saldo lo recalcula el servidor.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPayment(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void registerPayment()}>
                Registrar pago
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <FormField label="Fecha del pago" required>
              <Input
                data-autofocus
                type="date"
                value={payment.payment_date}
                onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })}
              />
            </FormField>
            <FormField label="Importe" required>
              <Input
                type="number"
                min={0}
                step="1"
                value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
              />
            </FormField>
            <FormField label="Medio de pago" required>
              <Select
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </FormField>
            <FormField label="Referencia">
              <Input
                value={payment.reference}
                onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
              />
            </FormField>
            <FormField label="Notas">
              <Textarea
                rows={2}
                value={payment.notes}
                onChange={(e) => setPayment({ ...payment, notes: e.target.value })}
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
