/** Formateadores compartidos (es-CO). */

const DATE_FMT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const NUMBER_FMT = new Intl.NumberFormat('es-CO');

/** Fecha civil sin hora: `YYYY-MM-DD`. La envía el servidor para retención,
 *  nacimiento, vinculación, apertura de expediente y devolución de préstamos. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte un valor del servidor en `Date` local.
 *
 * Una fecha civil se construye en la zona horaria local, nunca con
 * `new Date('2029-09-17')`: esa forma la interpreta como medianoche UTC y en
 * Colombia (UTC-5) se mostraría el día anterior. El vencimiento de una
 * retención documental no puede aparecer corrido un día.
 *
 * Es la única puerta de entrada: todo el cliente pasa por aquí en vez de
 * construir fechas por su cuenta.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const civil = DATE_ONLY.exec(value);
  const date = civil
    ? new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formatea una fecha para mostrarla. */
export function formatDate(value: string | null | undefined): string {
  const date = parseApiDate(value);
  return date === null ? '—' : DATE_FMT.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATETIME_FMT.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return NUMBER_FMT.format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Días restantes (negativo si ya pasó).
 *
 * Una fecha civil se compara contra el **inicio del día local**, no contra el
 * instante actual: si no, un vencimiento "hoy" aparecería como vencido a
 * partir de la tarde por el desfase con UTC.
 */
export function daysUntil(value: string | null | undefined): number | null {
  const date = parseApiDate(value);
  if (date === null) return null;
  if (DATE_ONLY.test(value ?? '')) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.round((date.getTime() - today) / 86_400_000);
  }
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export function relativeDays(value: string | null | undefined): string {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days === 0) return 'hoy';
  if (days > 0) return `en ${days} día${days === 1 ? '' : 's'}`;
  const past = Math.abs(days);
  return `hace ${past} día${past === 1 ? '' : 's'}`;
}

/** Fecha ISO (YYYY-MM-DD) para inputs de tipo date. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  // Una fecha civil ya viene en el formato del input: no se reinterpreta.
  if (DATE_ONLY.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Hoy como fecha civil `YYYY-MM-DD` en la zona del usuario. */
export function todayInput(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export function initials(fullName: string | null | undefined): string {
  if (!fullName) return '?';
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
