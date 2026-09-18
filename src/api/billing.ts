/**
 * Panel comercial (`docs/FACTURACION.md §2`).
 *
 * Los importes llegan como cadenas `NUMERIC` de PostgreSQL y se muestran tal
 * como los devuelve el servidor: aquí no se calcula ningún total.
 *
 * Nota legal: estos documentos **no** son factura electrónica válida ante la
 * DIAN. El campo `cufe` queda preparado por si más adelante se integra con un
 * proveedor tecnológico autorizado.
 */

import { api, downloadFile } from './client';
import type {
  BillingStats,
  Client,
  ClientSummary,
  CommercialItemInput,
  Invoice,
  License,
  LicensePlan,
  MyAccount,
  Paginated,
  PageQuery,
  Payment,
  Quote,
} from '@/types/api';

/* --------------------------------------------------------------- clientes */

export interface ClientListQuery extends PageQuery {
  status?: string;
  q?: string;
}

export function listClients(
  query: ClientListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Client>> {
  return api.get<Paginated<Client>>('/clients', { ...query }, signal);
}

export function getClient(id: string, signal?: AbortSignal): Promise<Client> {
  return api.get<Client>(`/clients/${id}`, undefined, signal);
}

export type ClientInput = Partial<Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by'>> & {
  name: string;
};

export function createClient(input: ClientInput): Promise<Client> {
  return api.post<Client>('/clients', input);
}

export function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  return api.patch<Client>(`/clients/${id}`, input);
}

/** Vista de 360°: licencia vigente, totales, últimas cotizaciones y facturas. */
export function getClientSummary(id: string, signal?: AbortSignal): Promise<ClientSummary> {
  return api.get<ClientSummary>(`/clients/${id}/summary`, undefined, signal);
}

/* ----------------------------------------------------------------- planes */

export function listLicensePlans(signal?: AbortSignal): Promise<LicensePlan[]> {
  return api.get<LicensePlan[]>('/license-plans', undefined, signal);
}

export function createLicensePlan(input: Partial<LicensePlan> & { code: string }): Promise<LicensePlan> {
  return api.post<LicensePlan>('/license-plans', input);
}

export function updateLicensePlan(code: string, input: Partial<LicensePlan>): Promise<LicensePlan> {
  return api.patch<LicensePlan>(`/license-plans/${encodeURIComponent(code)}`, input);
}

/* -------------------------------------------------------------- licencias */

export interface LicenseListQuery extends PageQuery {
  client_id?: string;
  status?: string;
}

export function listLicenses(
  query: LicenseListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<License>> {
  return api.get<Paginated<License>>('/licenses', { ...query }, signal);
}

export interface LicenseInput {
  client_id: string;
  plan_code: string;
  start_date: string;
  end_date?: string | null;
  seats?: number | null;
  storage_gb?: number | null;
  price_amount?: number | null;
  auto_renew?: boolean;
  notes?: string | null;
}

export function createLicense(input: LicenseInput): Promise<License> {
  return api.post<License>('/licenses', input);
}

export function updateLicense(id: string, input: Partial<LicenseInput>): Promise<License> {
  return api.patch<License>(`/licenses/${id}`, input);
}

/** Prorroga según el periodo del plan; el servidor calcula las fechas. */
export function renewLicense(id: string): Promise<License> {
  return api.post<License>(`/licenses/${id}/renew`);
}

export function listExpiringLicenses(days: number, signal?: AbortSignal): Promise<License[]> {
  return api.get<License[]>('/licenses/expiring', { days }, signal);
}

/* ----------------------------------------------------------- cotizaciones */

export interface QuoteListQuery extends PageQuery {
  client_id?: string;
  status?: string;
  q?: string;
}

export function listQuotes(
  query: QuoteListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Quote>> {
  return api.get<Paginated<Quote>>('/quotes', { ...query }, signal);
}

export function getQuote(id: string, signal?: AbortSignal): Promise<Quote> {
  return api.get<Quote>(`/quotes/${id}`, undefined, signal);
}

export interface QuoteInput {
  client_id: string;
  issue_date?: string;
  valid_until?: string | null;
  tax_rate?: number;
  notes?: string | null;
  terms?: string | null;
  items: CommercialItemInput[];
}

export function createQuote(input: QuoteInput): Promise<Quote> {
  return api.post<Quote>('/quotes', input);
}

export function updateQuote(id: string, input: Partial<QuoteInput>): Promise<Quote> {
  return api.patch<Quote>(`/quotes/${id}`, input);
}

export function setQuoteStatus(id: string, status: string, notes?: string): Promise<Quote> {
  return api.post<Quote>(`/quotes/${id}/status`, notes ? { status, notes } : { status });
}

/** Crea la factura copiando las líneas y deja la traza `invoice.quote_id`. */
export function convertQuote(id: string): Promise<Invoice> {
  return api.post<Invoice>(`/quotes/${id}/convert`);
}

export function downloadQuotePdf(id: string, number: string | null): Promise<void> {
  return downloadFile(`/quotes/${id}/pdf`, undefined, `${number ?? `cotizacion-${id}`}.pdf`);
}

/* --------------------------------------------------------------- facturas */

export interface InvoiceListQuery extends PageQuery {
  client_id?: string;
  status?: string;
  q?: string;
}

export function listInvoices(
  query: InvoiceListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Invoice>> {
  return api.get<Paginated<Invoice>>('/invoices', { ...query }, signal);
}

export function getInvoice(id: string, signal?: AbortSignal): Promise<Invoice> {
  return api.get<Invoice>(`/invoices/${id}`, undefined, signal);
}

export interface InvoiceInput {
  client_id: string;
  quote_id?: string | null;
  license_id?: string | null;
  issue_date?: string;
  due_date?: string | null;
  tax_rate?: number;
  notes?: string | null;
  items: CommercialItemInput[];
}

export function createInvoice(input: InvoiceInput): Promise<Invoice> {
  return api.post<Invoice>('/invoices', input);
}

export function updateInvoice(id: string, input: Partial<InvoiceInput>): Promise<Invoice> {
  return api.patch<Invoice>(`/invoices/${id}`, input);
}

/** Emitir: asigna el consecutivo y fija `issued_at`. */
export function issueInvoice(id: string): Promise<Invoice> {
  return api.post<Invoice>(`/invoices/${id}/issue`);
}

/** Anular exige motivo: no borra, conserva el consecutivo y queda auditado. */
export function voidInvoice(id: string, reason: string): Promise<Invoice> {
  return api.post<Invoice>(`/invoices/${id}/void`, { reason });
}

export function downloadInvoicePdf(id: string, number: string | null): Promise<void> {
  return downloadFile(`/invoices/${id}/pdf`, undefined, `${number ?? `factura-${id}`}.pdf`);
}

/* ----------------------------------------------------------------- pagos */

export interface PaymentListQuery extends PageQuery {
  invoice_id?: string;
  client_id?: string;
}

export function listPayments(
  query: PaymentListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Payment>> {
  return api.get<Paginated<Payment>>('/payments', { ...query }, signal);
}

export interface PaymentInput {
  invoice_id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
}

export function createPayment(input: PaymentInput): Promise<Payment> {
  return api.post<Payment>('/payments', input);
}

/** Revertir un pago exige motivo y queda auditado. */
export function deletePayment(id: string, reason: string): Promise<void> {
  return api.del<void>(`/payments/${id}`, { reason });
}

/* ------------------------------------------------------- resumen y cuenta */

export function getBillingStats(
  range: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<BillingStats> {
  return api.get<BillingStats>('/billing/stats', { ...range }, signal);
}

/** Solo lectura para la institución cliente. */
export function getMyAccount(signal?: AbortSignal): Promise<MyAccount> {
  return api.get<MyAccount>('/billing/my-account', undefined, signal);
}
