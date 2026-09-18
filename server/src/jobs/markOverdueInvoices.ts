import { markOverdueInvoices } from '../services/billing.js';

/**
 * Marca como VENCIDAS las facturas emitidas o con abono parcial cuyo plazo
 * pasó y conservan saldo. Es el único camino por el que una factura llega a
 * `OVERDUE`: el disparador de pagos nunca adivina la fecha.
 */
export async function markOverdueInvoicesJob(): Promise<Record<string, unknown>> {
  const overdue = await markOverdueInvoices();
  return { overdue };
}
