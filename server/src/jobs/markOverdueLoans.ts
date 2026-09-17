import { markOverdueAndNotify } from '../services/loans.js';

/** Marca como vencidos los préstamos activos fuera de plazo y notifica. */
export async function markOverdueLoansJob(): Promise<Record<string, unknown>> {
  const count = await markOverdueAndNotify();
  return { overdue: count };
}
