/**
 * Importes comerciales.
 *
 * El servidor guarda los montos en `NUMERIC` y los entrega como cadena para no
 * perder precisión. Aquí solo se **formatean**: ningún total mostrado como
 * verdad se calcula en el cliente (`docs/FACTURACION.md §4`).
 */

/** Convierte el `NUMERIC` del servidor a número solo para formatear. */
export function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const CACHE = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let found = CACHE.get(key);
  if (!found) {
    found = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    CACHE.set(key, found);
  }
  return found;
}

/**
 * Pesos colombianos con separador de miles. La moneda la manda el servidor
 * (`currency` de cada documento o del plan), no una constante del cliente.
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'COP',
  options: { decimals?: number; emptyLabel?: string } = {},
): string {
  const amount = toAmount(value);
  if (amount === null) return options.emptyLabel ?? '—';
  // El peso no usa centavos en la práctica; otras monedas sí.
  const decimals = options.decimals ?? (currency === 'COP' ? 0 : 2);
  try {
    return formatter(currency, decimals).format(amount);
  } catch {
    // Código de moneda desconocido para Intl: se muestra tal cual.
    return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: decimals }).format(amount)} ${currency}`;
  }
}

/** Porcentaje de impuesto tal como lo publica el servidor (0.19 o 19). */
export function formatTaxRate(value: string | number | null | undefined): string {
  const rate = toAmount(value);
  if (rate === null) return '—';
  const percent = rate > 0 && rate <= 1 ? rate * 100 : rate;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(percent)} %`;
}
