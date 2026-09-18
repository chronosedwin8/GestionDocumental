import { useMemo, useState } from 'react';
import { ArrowRightLeft, Download, FileText, Pencil, Plus, Search } from 'lucide-react';
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
import { formatMoney, formatTaxRate } from '@/lib/money';
import { LineItemsEditor, EMPTY_LINE } from '../LineItemsEditor';
import { DIAN_NOTICE, QUOTE_STATUS_OPTIONS, quoteStatus } from '../labels';
import type { Client, CommercialItemInput, LicensePlan, Quote } from '@/types/api';
import type { Column } from '@/types/ui';

interface QuoteForm {
  id: string | null;
  client_id: string;
  issue_date: string;
  valid_until: string;
  tax_rate: string;
  notes: string;
  terms: string;
  items: CommercialItemInput[];
}

export interface QuotesTabProps {
  clients: Client[];
  plans: LicensePlan[];
  /** Impuesto y vigencia por defecto que publica el servidor. */
  defaults: { tax_rate: number | null; quote_validity_days: number | null };
}

export function QuotesTab({ clients, plans, defaults }: QuotesTabProps): React.JSX.Element {
  const { confirm } = useDialogs();
  const pagination = usePagination({ initialSort: 'issue_date', initialOrder: 'desc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<QuoteForm | null>(null);
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

  const quotes = useQuery(`billing:quotes:${JSON.stringify(query)}`, (signal) =>
    billingApi.listQuotes(query, signal),
  );

  const newForm = (): QuoteForm => ({
    id: null,
    client_id: clients[0]?.id ?? '',
    issue_date: todayInput(),
    valid_until: defaults.quote_validity_days ? todayInput(defaults.quote_validity_days) : '',
    tax_rate: defaults.tax_rate !== null ? String(defaults.tax_rate) : '',
    notes: '',
    terms: '',
    items: [{ ...EMPTY_LINE }],
  });

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.client_id) {
      toast.error('Selecciona el cliente de la cotización.');
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
      valid_until: form.valid_until || null,
      ...(form.tax_rate !== '' ? { tax_rate: Number(form.tax_rate) } : {}),
      notes: form.notes.trim() || null,
      terms: form.terms.trim() || null,
      items: form.items.map((item, index) => ({ ...item, position: index + 1 })),
    };
    try {
      if (form.id) await billingApi.updateQuote(form.id, payload);
      else await billingApi.createQuote(payload);
      toast.success(form.id ? 'Cotización actualizada.' : 'Cotización creada.');
      setForm(null);
      invalidatePrefix('billing:');
      await quotes.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la cotización.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (quote: Quote, status: string): Promise<void> => {
    setBusyId(quote.id);
    try {
      await billingApi.setQuoteStatus(quote.id, status);
      toast.success('Estado actualizado.');
      invalidatePrefix('billing:');
      await quotes.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (quote: Quote): Promise<void> => {
    const ok = await confirm({
      title: 'Convertir en factura',
      message: `Se creará una factura con las líneas de ${quote.number ?? 'esta cotización'}. La cotización se conserva con su trazabilidad.`,
      confirmLabel: 'Convertir',
    });
    if (!ok) return;
    setBusyId(quote.id);
    try {
      const invoice = await billingApi.convertQuote(quote.id);
      toast.success(
        `Factura creada${invoice.number ? ` (${invoice.number})` : ''}. Saldo ${formatMoney(
          invoice.balance,
          invoice.currency,
        )}.`,
      );
      invalidatePrefix('billing:');
      await quotes.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo convertir la cotización.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (quote: Quote): Promise<void> => {
    try {
      await billingApi.downloadQuotePdf(quote.id, quote.number);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el PDF.');
    }
  };

  const columns = useMemo<Column<Quote>[]>(
    () => [
      {
        key: 'number',
        header: 'Cotización',
        sortField: 'number',
        primary: true,
        required: true,
        render: (quote) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-content-primary">
              {quote.number ?? 'Sin número'}
            </p>
            <p className="truncate text-[11px] text-content-muted">
              {quote.client_name ?? quote.client_id}
            </p>
          </div>
        ),
      },
      {
        key: 'issue',
        header: 'Emisión',
        sortField: 'issue_date',
        render: (quote) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {formatDate(quote.issue_date)}
          </span>
        ),
      },
      {
        key: 'valid',
        header: 'Vigente hasta',
        render: (quote) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {formatDate(quote.valid_until)}
          </span>
        ),
      },
      {
        key: 'tax',
        header: 'Impuesto',
        render: (quote) => (
          <span className="text-xs text-content-secondary">{formatTaxRate(quote.tax_rate)}</span>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        render: (quote) => (
          <span className="font-mono text-xs text-content-primary">
            {formatMoney(quote.total, quote.currency)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        sortField: 'status',
        render: (quote) => {
          const status = quoteStatus(quote.status);
          return <Badge color={status.color}>{status.label}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de cotizaciones">
        <Input
          className="min-w-[200px] flex-1"
          placeholder="Buscar por número o cliente…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar cotizaciones"
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
          options={QUOTE_STATUS_OPTIONS}
        />
        <div className="flex-1" />
        <IfFeature code="QUOTE_MANAGE">
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm(newForm())}>
            Nueva cotización
          </Button>
        </IfFeature>
      </Toolbar>

      {quotes.error ? (
        <ApiErrorState error={quotes.error} onRetry={() => void quotes.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={quotes.data?.data ?? []}
          rowKey={(quote) => quote.id}
          loading={quotes.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={quotes.data?.page ?? pagination.page}
          pageSize={quotes.data?.pageSize ?? pagination.pageSize}
          total={quotes.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin cotizaciones"
          emptyDescription="Crea la primera cotización para un cliente y conviértela en factura cuando la acepten."
          caption="Cotizaciones"
          rowActions={(quote) => (
            <>
              <IfFeature code="QUOTE_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${quote.number ?? 'cotización'}`}
                  disabled={busyId === quote.id}
                  onClick={() =>
                    setForm({
                      id: quote.id,
                      client_id: quote.client_id,
                      issue_date: quote.issue_date,
                      valid_until: quote.valid_until ?? '',
                      tax_rate: String(quote.tax_rate ?? ''),
                      notes: quote.notes ?? '',
                      terms: quote.terms ?? '',
                      items:
                        quote.items?.map((item) => ({
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
              <IfFeature code="QUOTE_MANAGE">
                <Select
                  className="w-36"
                  aria-label={`Cambiar el estado de ${quote.number ?? 'la cotización'}`}
                  value={quote.status}
                  disabled={busyId === quote.id}
                  onChange={(e) => void changeStatus(quote, e.target.value)}
                  options={QUOTE_STATUS_OPTIONS}
                />
              </IfFeature>
              <IfFeature code="INVOICE_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Convertir ${quote.number ?? 'la cotización'} en factura`}
                  disabled={busyId === quote.id || quote.status !== 'ACCEPTED'}
                  title={
                    quote.status === 'ACCEPTED'
                      ? 'Convertir en factura'
                      : 'Solo se convierten las cotizaciones aceptadas'
                  }
                  onClick={() => void convert(quote)}
                  icon={<ArrowRightLeft className="h-4 w-4" />}
                />
              </IfFeature>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Descargar el PDF de ${quote.number ?? 'la cotización'}`}
                onClick={() => void downloadPdf(quote)}
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
              <FileText className="h-4 w-4 text-acid" aria-hidden />
              {form.id ? 'Editar cotización' : 'Nueva cotización'}
            </span>
          }
          description="El subtotal, el impuesto y el total los calcula el servidor al guardar."
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
              <FormField label="Vigente hasta">
                <Input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                />
              </FormField>
              <FormField
                label="Impuesto"
                hint={
                  defaults.tax_rate !== null
                    ? `Por defecto ${formatTaxRate(defaults.tax_rate)} según la configuración del servidor.`
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
            <FormField label="Términos">
              <Textarea
                rows={2}
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
              />
            </FormField>

            <p className="text-[10px] text-content-muted">{DIAN_NOTICE}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
