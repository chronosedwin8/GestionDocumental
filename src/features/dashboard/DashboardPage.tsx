import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Archive,
  BookOpen,
  Database,
  FileStack,
  FolderOpen,
  HardDrive,
  Hash,
  LayoutDashboard,
  Tag,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import * as loansApi from '@/api/loans';
import * as statsApi from '@/api/stats';
import { useFeature } from '@/hooks/useFeature';
import { useQuery } from '@/hooks/useQuery';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { Skeleton, SkeletonCards } from '@/components/ui/Skeleton';
import { daysUntil, formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { SetupChecklist } from '@/features/onboarding/SetupChecklist';
import { MonthlyChart } from './widgets/MonthlyChart';
import { PendingInbox } from './widgets/PendingInbox';
import { QuickAccess } from './widgets/QuickAccess';
import { StatCard } from './widgets/StatCard';

/** Ventana de aviso (días) para "préstamos por vencer", igual que `ret7`. */
const DUE_SOON_DAYS = 7;

export default function DashboardPage(): React.JSX.Element {
  const { user, isAdminArea } = useAuth();
  // Quien no puede auditar solo recibe sus propias acciones en el tablero.
  const canViewAudit = useFeature('AUDIT_VIEW');
  const { activeModules, moduleColor, moduleLabel, statusLabel, statusColor, settings } = useCatalogs();

  const stats = useQuery('stats:dashboard', (signal) => statsApi.dashboard(signal));
  const alerts = useQuery('stats:alerts', (signal) => statsApi.alerts(signal));
  // Préstamos activos que vencen pronto: el contrato no expone ese contador,
  // así que se deriva de la primera página de préstamos activos reales.
  const activeLoans = useQuery('loans:active:due-soon', (signal) =>
    loansApi.listLoans({ status: 'ACTIVE', pageSize: 100 }, signal),
  );

  const loansDueSoon = (activeLoans.data?.data ?? []).filter((loan) => {
    const days = daysUntil(loan.expected_return_date);
    return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
  }).length;

  if (stats.error) {
    return (
      <>
        <PageHeader title="Panel General" icon={<LayoutDashboard className="h-5 w-5 text-acid" />} />
        <ApiErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      </>
    );
  }

  const data = stats.data;
  const moduleTotals = new Map(data?.documents_by_module.map((row) => [row.code, row.total]) ?? []);

  return (
    <>
      <PageHeader
        title="Panel General"
        description={
          user ? `Hola, ${user.full_name.split(' ')[0]} — resumen del archivo institucional.` : undefined
        }
        icon={<LayoutDashboard className="h-5 w-5 text-acid" aria-hidden />}
        actions={
          <>
            {settings && (
              <Badge color={settings.storage_configured ? 'var(--color-success)' : 'var(--color-warning)'}>
                <HardDrive className="h-3 w-3" aria-hidden />
                {settings.storage_configured ? 'Almacenamiento activo' : 'Almacenamiento sin configurar'}
              </Badge>
            )}
            <HelpButton slug="primeros-pasos" contextLabel="Panel general" label="Ayuda del panel" />
          </>
        }
      />

      {stats.loading || !data ? (
        <div className="space-y-6">
          <SkeletonCards />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Documentos totales"
              value={formatNumber(data.total_documents)}
              icon={<FileStack className="h-5 w-5" aria-hidden />}
              accent="var(--color-acid)"
            />
            <StatCard
              label="Ingresados este mes"
              value={formatNumber(data.documents_this_month)}
              icon={<TrendingUp className="h-5 w-5" aria-hidden />}
              accent="var(--color-info)"
            />
            <StatCard
              label="Alertas de retención"
              value={formatNumber(data.retention_alerts)}
              icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
              accent="var(--color-warning)"
              to="/estadisticas?tab=alertas"
            />
            <StatCard
              label="Almacenamiento usado"
              value={data.storage.configured ? formatBytes(data.storage.bytes) : 'Sin configurar'}
              icon={<Database className="h-5 w-5" aria-hidden />}
              accent="var(--color-success)"
              to={isAdminArea && !data.storage.configured ? '/admin/almacenamiento' : undefined}
            />
          </div>

          {/* Puesta en marcha (P9) y bandeja de pendientes (U3) */}
          <SetupChecklist />

          <PendingInbox
            actions={data.pending_actions}
            retentionSoon={alerts.data?.counts.retention ?? 0}
            loansDueSoon={loansDueSoon}
            isAdminArea={isAdminArea}
            loading={alerts.loading || activeLoans.loading}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Módulos */}
            <section className="panel xl:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
                <FolderOpen className="h-4 w-4 text-acid" aria-hidden />
                Documentos por dependencia
              </h2>
              {activeModules.length === 0 ? (
                <p className="text-sm text-content-muted">No hay dependencias activas en el catálogo.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeModules.map((module) => (
                    <li key={module.code}>
                      <Link
                        to={`/modulos/${module.code}`}
                        className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2.5 no-underline transition-colors hover:border-acid-border hover:no-underline"
                      >
                        <DynamicIcon
                          name={module.icon}
                          className="h-5 w-5 flex-shrink-0"
                          style={{ color: moduleColor(module.code) }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-content-secondary">
                          {module.name}
                        </span>
                        <span className="font-mono text-sm font-semibold text-content-primary">
                          {formatNumber(moduleTotals.get(module.code) ?? 0)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Estados */}
            <section className="panel">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
                <Tag className="h-4 w-4 text-acid" aria-hidden />
                Ciclo de vida
              </h2>
              {data.documents_by_status.length === 0 ? (
                <p className="text-sm text-content-muted">Sin documentos registrados.</p>
              ) : (
                <ul className="space-y-2">
                  {data.documents_by_status.map((row) => {
                    const percent =
                      data.total_documents > 0 ? (row.total / data.total_documents) * 100 : 0;
                    return (
                      <li key={row.code}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-content-secondary">{statusLabel(row.code)}</span>
                          <span className="font-mono text-content-primary">{formatNumber(row.total)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${percent}%`, backgroundColor: statusColor(row.code) }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Semáforo de retención */}
          {data.retention_semaphore.length > 0 && (
            <section className="panel">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
                <Archive className="h-4 w-4 text-acid" aria-hidden />
                Semáforo de retención por dependencia
              </h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                {data.retention_semaphore.map((row) => (
                  <li
                    key={row.module_code}
                    className="rounded-lg border border-line bg-surface-sunken p-3"
                  >
                    <p className="truncate text-[11px] text-content-muted">{moduleLabel(row.module_code)}</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-content-primary">
                      {formatNumber(row.total)}
                    </p>
                    {row.alerts > 0 && (
                      <Badge color="var(--color-warning)" className="mt-1">
                        {row.alerts} en alerta
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <QuickAccess />
            <MonthlyChart />

            <section className="panel">
              <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
                <Activity className="h-4 w-4 text-acid" aria-hidden />
                Últimas actividades
              </h2>
              {/* `recent_activity` es global solo para acceso total y AUDITOR;
                  el resto ve solo sus propias acciones y un usuario nuevo la
                  recibe vacía (CONTRACT_NOTES §9). No es un fallo. */}
              {data.recent_activity.length === 0 ? (
                <p className="text-sm text-content-muted">
                  {canViewAudit
                    ? 'Todavía no hay acciones registradas en el sistema.'
                    : 'Aquí aparecerán tus propias acciones. El historial completo del sistema solo lo ve quien tiene permiso de auditoría.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.recent_activity.slice(0, 8).map((log) => (
                    <li
                      key={log.id}
                      className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                    >
                      <Hash className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-content-muted" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-content-primary">
                          <span className="font-mono">{log.action}</span>
                          {log.resource_type && (
                            <span className="text-content-muted"> · {log.resource_type}</span>
                          )}
                        </p>
                        <p className="truncate text-[10px] text-content-muted">
                          {log.user_email ?? 'Sistema'} · {formatDateTime(log.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              to="/expedientes"
              className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 no-underline transition-colors hover:border-acid-border hover:no-underline"
            >
              <FolderOpen className="h-5 w-5 text-state-warning" aria-hidden />
              <span className="text-sm text-content-secondary">Expedientes y correspondencia</span>
            </Link>
            <Link
              to="/trd"
              className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 no-underline transition-colors hover:border-acid-border hover:no-underline"
            >
              <BookOpen className="h-5 w-5 text-state-info" aria-hidden />
              <span className="text-sm text-content-secondary">Tablas de retención</span>
            </Link>
            <Link
              to="/papelera"
              className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 no-underline transition-colors hover:border-acid-border hover:no-underline"
            >
              <Trash2 className="h-5 w-5 text-state-danger" aria-hidden />
              <span className="text-sm text-content-secondary">Papelera</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
