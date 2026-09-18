/**
 * Etiquetas de los estados comerciales.
 *
 * `docs/FACTURACION.md` fija estos códigos en el propio modelo (no hay un
 * catálogo editable como el de documentos), así que aquí solo se traducen a
 * español y se les asigna un color del tema. Cualquier código que el servidor
 * añada se muestra tal cual en vez de desaparecer, y el mismo criterio siguen
 * `ExpedientesPage` y `PersonDetailPage` con sus estados.
 */

type Entry = { label: string; color: string };

const CLIENT: Record<string, Entry> = {
  PROSPECT: { label: 'Prospecto', color: 'var(--color-info)' },
  ACTIVE: { label: 'Activo', color: 'var(--color-success)' },
  SUSPENDED: { label: 'Suspendido', color: 'var(--color-warning)' },
  FORMER: { label: 'Antiguo', color: 'var(--text-muted)' },
};

const QUOTE: Record<string, Entry> = {
  DRAFT: { label: 'Borrador', color: 'var(--text-muted)' },
  SENT: { label: 'Enviada', color: 'var(--color-info)' },
  ACCEPTED: { label: 'Aceptada', color: 'var(--color-success)' },
  REJECTED: { label: 'Rechazada', color: 'var(--color-danger)' },
  EXPIRED: { label: 'Vencida', color: 'var(--color-warning)' },
};

const INVOICE: Record<string, Entry> = {
  DRAFT: { label: 'Borrador', color: 'var(--text-muted)' },
  ISSUED: { label: 'Emitida', color: 'var(--color-info)' },
  PARTIAL: { label: 'Pago parcial', color: 'var(--color-warning)' },
  PAID: { label: 'Pagada', color: 'var(--color-success)' },
  OVERDUE: { label: 'Vencida', color: 'var(--color-danger)' },
  VOID: { label: 'Anulada', color: 'var(--text-muted)' },
};

const LICENSE: Record<string, Entry> = {
  ACTIVE: { label: 'Vigente', color: 'var(--color-success)' },
  EXPIRED: { label: 'Vencida', color: 'var(--color-danger)' },
  SUSPENDED: { label: 'Suspendida', color: 'var(--color-warning)' },
  CANCELLED: { label: 'Cancelada', color: 'var(--text-muted)' },
};

const PAYMENT_METHOD: Record<string, string> = {
  TRANSFER: 'Transferencia',
  PSE: 'PSE',
  CASH: 'Efectivo',
  CHECK: 'Cheque',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
};

const BILLING_PERIOD: Record<string, string> = {
  MONTHLY: 'Mensual',
  ANNUAL: 'Anual',
  CUSTOM: 'A la medida',
};

function resolve(table: Record<string, Entry>, code: string | null | undefined): Entry {
  if (!code) return { label: '—', color: 'var(--text-muted)' };
  return table[code] ?? { label: code, color: 'var(--text-muted)' };
}

export const clientStatus = (code: string | null | undefined): Entry => resolve(CLIENT, code);
export const quoteStatus = (code: string | null | undefined): Entry => resolve(QUOTE, code);
export const invoiceStatus = (code: string | null | undefined): Entry => resolve(INVOICE, code);
export const licenseStatus = (code: string | null | undefined): Entry => resolve(LICENSE, code);

export const paymentMethodLabel = (code: string | null | undefined): string =>
  code ? (PAYMENT_METHOD[code] ?? code) : '—';

export const billingPeriodLabel = (code: string | null | undefined): string =>
  code ? (BILLING_PERIOD[code] ?? code) : '—';

/** Opciones para los selectores, derivadas de las mismas tablas. */
export const CLIENT_STATUS_OPTIONS = Object.entries(CLIENT).map(([value, entry]) => ({
  value,
  label: entry.label,
}));
export const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE).map(([value, entry]) => ({
  value,
  label: entry.label,
}));
export const INVOICE_STATUS_OPTIONS = Object.entries(INVOICE).map(([value, entry]) => ({
  value,
  label: entry.label,
}));
export const LICENSE_STATUS_OPTIONS = Object.entries(LICENSE).map(([value, entry]) => ({
  value,
  label: entry.label,
}));
export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Aviso obligatorio: este panel numera y registra documentos comerciales,
 * pero **no** emite factura electrónica válida ante la DIAN.
 */
export const DIAN_NOTICE =
  'Documento comercial interno: no constituye factura electrónica válida ante la DIAN.';
