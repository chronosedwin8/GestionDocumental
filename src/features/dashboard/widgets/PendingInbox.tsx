import { Link } from 'react-router-dom';
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Hash,
  Inbox,
  Timer,
  Trash2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import type { DashboardStats } from '@/types/api';

export interface PendingInboxProps {
  actions: DashboardStats['pending_actions'];
  /** Documentos cuya retención vence pronto (`/stats/alerts`). */
  retentionSoon: number;
  /** Préstamos activos que vencen dentro de la ventana de aviso. */
  loansDueSoon: number;
  isAdminArea: boolean;
  loading?: boolean;
}

/**
 * Bandeja de pendientes del archivista (U3). Cada tarjeta abre la vista más
 * concreta que ofrece el servidor para resolver ese pendiente.
 *
 * Nota: la API no expone listados filtrados por "sin TRD", "sin folio" ni
 * "sin expediente" (solo los contadores de `/stats/dashboard`), así que esas
 * tarjetas llevan al desglose por dependencia en Estadísticas en lugar de
 * inventar un filtro que el servidor no soporta.
 */
export function PendingInbox({
  actions,
  retentionSoon,
  loansDueSoon,
  isAdminArea,
  loading = false,
}: PendingInboxProps): React.JSX.Element {
  const items = [
    {
      key: 'without_trd',
      label: 'Sin clasificación TRD',
      hint: 'Ver cumplimiento por dependencia',
      value: actions.without_trd,
      icon: <BookOpen className="h-4 w-4" aria-hidden />,
      to: '/estadisticas?tab=general',
      accent: 'var(--color-warning)',
    },
    {
      key: 'without_folio',
      label: 'Sin foliar',
      hint: 'Ver detalle por dependencia',
      value: actions.without_folio,
      icon: <Hash className="h-4 w-4" aria-hidden />,
      to: '/estadisticas?tab=modulo',
      accent: 'var(--color-info)',
    },
    {
      key: 'without_expediente',
      label: 'Sin expediente',
      hint: 'Abrir expedientes',
      value: actions.without_expediente,
      icon: <FolderOpen className="h-4 w-4" aria-hidden />,
      to: '/expedientes',
      accent: 'var(--color-acid)',
    },
    {
      key: 'deletion_requests',
      label: 'Solicitudes de eliminación',
      hint: isAdminArea ? 'Revisar solicitudes' : 'Ver papelera',
      value: actions.deletion_requests,
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      to: isAdminArea ? '/admin/eliminaciones' : '/papelera',
      accent: 'var(--color-danger)',
    },
    {
      key: 'overdue_loans',
      label: 'Préstamos vencidos',
      hint: isAdminArea ? 'Registrar devoluciones' : 'Ver alertas',
      value: actions.overdue_loans,
      icon: <AlarmClock className="h-4 w-4" aria-hidden />,
      to: isAdminArea ? '/admin/prestamos?estado=OVERDUE' : '/estadisticas?tab=alertas',
      accent: 'var(--color-danger)',
    },
    {
      key: 'loans_due_soon',
      label: 'Préstamos por vencer',
      hint: isAdminArea ? 'Ver préstamos activos' : 'Ver alertas',
      value: loansDueSoon,
      icon: <Timer className="h-4 w-4" aria-hidden />,
      to: isAdminArea ? '/admin/prestamos?estado=ACTIVE' : '/estadisticas?tab=alertas',
      accent: 'var(--color-warning)',
    },
    {
      key: 'retention_soon',
      label: 'Retenciones próximas',
      hint: 'Ver alertas de retención',
      value: retentionSoon,
      icon: <CalendarClock className="h-4 w-4" aria-hidden />,
      to: '/estadisticas?tab=alertas',
      accent: 'var(--color-warning)',
    },
  ].filter((item) => item.value > 0);

  return (
    <section className="panel" aria-labelledby="pendientes-title">
      <h2
        id="pendientes-title"
        className="mb-4 flex items-center gap-2 font-display text-base text-content-primary"
      >
        <Inbox className="h-4 w-4 text-acid" aria-hidden />
        Bandeja de pendientes
      </h2>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-state-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          No hay pendientes: todo el archivo está clasificado, foliado y al día.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3 no-underline transition-colors hover:border-acid-border hover:no-underline"
              >
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ color: item.accent, backgroundColor: `${item.accent}1a` }}
                >
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-lg font-semibold text-content-primary">
                    {formatNumber(item.value)}
                  </span>
                  <span className="block truncate text-[11px] text-content-muted">{item.label}</span>
                  <span className="block truncate text-[10px] text-acid">{item.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
