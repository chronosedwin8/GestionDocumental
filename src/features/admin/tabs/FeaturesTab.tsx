import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as featuresApi from '@/api/features';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Feature, Role } from '@/types/api';

export function cellKey(roleCode: string, featureCode: string): string {
  return `${roleCode}::${featureCode}`;
}

/**
 * Una característica núcleo no se puede desactivar en un rol de acceso total
 * (`PERMISOS §2.2`): así ningún administrador se deja a sí mismo fuera.
 * La misma regla la aplican la base y la API; aquí solo se explica.
 */
export function isLockedCell(role: Role, feature: Feature): boolean {
  return feature.is_core && role.has_full_access;
}

export function isEnabled(
  entries: Map<string, boolean>,
  role: Role,
  feature: Feature,
): boolean {
  if (isLockedCell(role, feature)) return true;
  return entries.get(cellKey(role.code, feature.code)) ?? false;
}

export function FeaturesTab(): React.JSX.Element {
  const { roles, features, featureCategories, reload } = useCatalogs();
  const { confirm } = useDialogs();
  const matrix = useQuery('features:matrix', (signal) => featuresApi.getFeatureMatrix(signal));

  const [entries, setEntries] = useState<Map<string, boolean>>(new Map());
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!matrix.data) return;
    setEntries(new Map(matrix.data.map((row) => [cellKey(row.role_code, row.feature_code), row.enabled])));
  }, [matrix.data]);

  /** Características de cada categoría, ambas ordenadas por el servidor. */
  const grouped = useMemo(
    () =>
      featureCategories
        .map((category) => ({
          category,
          items: features.filter((feature) => feature.category_code === category.code),
        }))
        .filter((group) => group.items.length > 0),
    [featureCategories, features],
  );

  /** Contador de características activas por rol. */
  const counters = useMemo(() => {
    const totals = new Map<string, number>();
    for (const role of roles) {
      let total = 0;
      for (const feature of features) if (isEnabled(entries, role, feature)) total += 1;
      totals.set(role.code, total);
    }
    return totals;
  }, [roles, features, entries]);

  const refresh = useCallback(async (): Promise<void> => {
    await matrix.refetch();
  }, [matrix]);

  const toggleCell = async (role: Role, feature: Feature): Promise<void> => {
    if (isLockedCell(role, feature)) return;
    const key = cellKey(role.code, feature.code);
    const next = !(entries.get(key) ?? false);
    const previous = new Map(entries);

    setBusyCell(key);
    setEntries((prev) => new Map(prev).set(key, next));
    try {
      await featuresApi.setFeatureMatrixEntry({
        role_code: role.code,
        feature_code: feature.code,
        enabled: next,
      });
      toast.success(`${feature.name}: ${next ? 'habilitada' : 'deshabilitada'} para ${role.name}.`);
    } catch (err) {
      setEntries(previous);
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la característica.',
      );
    } finally {
      setBusyCell(null);
    }
  };

  const toggleCategory = async (
    role: Role,
    categoryCode: string,
    items: Feature[],
    enable: boolean,
  ): Promise<void> => {
    // Las núcleo de un rol de acceso total se excluyen: el servidor las
    // rechazaría con 409 CORE_FEATURE y el resto del lote se perdería.
    const target = items.filter((feature) => !isLockedCell(role, feature));
    if (target.length === 0) return;

    const key = `${role.code}::${categoryCode}`;
    const previous = new Map(entries);
    setBusyGroup(key);
    setEntries((prev) => {
      const next = new Map(prev);
      for (const feature of target) next.set(cellKey(role.code, feature.code), enable);
      return next;
    });

    try {
      await featuresApi.setFeatureMatrixBulk({
        role_code: role.code,
        features: target.map((feature) => ({ code: feature.code, enabled: enable })),
      });
      toast.success(
        `${target.length} característica(s) ${enable ? 'habilitadas' : 'deshabilitadas'} para ${role.name}.`,
      );
    } catch (err) {
      setEntries(previous);
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aplicar el cambio por categoría.');
    } finally {
      setBusyGroup(null);
    }
  };

  const restoreDefaults = async (role?: Role): Promise<void> => {
    const ok = await confirm({
      title: role ? `Restaurar valores por defecto de ${role.name}` : 'Restaurar toda la matriz',
      message: role
        ? `Las características de ${role.name} volverán a los valores de la semilla del sistema. Los cambios quedan en auditoría.`
        : 'Todas las características de todos los roles volverán a los valores de la semilla del sistema.',
      tone: 'danger',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;

    setResetting(true);
    try {
      await featuresApi.resetFeatureMatrix(role?.code);
      await refresh();
      toast.success('Valores por defecto restaurados.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restaurar la matriz.');
    } finally {
      setResetting(false);
    }
  };

  const toggleCollapse = (code: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  if (matrix.error) return <ApiErrorState error={matrix.error} onRetry={() => void refresh()} />;
  if (matrix.loading) return <Skeleton className="h-96 w-full" />;

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title="Sin catálogo de características"
        description="El servidor no publicó características ni categorías en /catalogs ni en /features. Sin ese catálogo la matriz no se puede construir: no se inventan códigos en el cliente."
        action={{ label: 'Recargar catálogos', onClick: () => void reload() }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-start gap-3 text-xs text-content-muted">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
        <p className="min-w-[240px] flex-1">
          Para actuar, el usuario necesita la característica habilitada en su rol <em>y</em> acceso a la
          dependencia. Las dos condiciones se suman. Ocultar un botón aquí no protege nada por sí solo:
          el servidor rechaza con 403 <code className="font-mono">FEATURE_DISABLED</code>.
        </p>
        <Button
          size="sm"
          variant="outline"
          loading={resetting}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={() => void restoreDefaults()}
        >
          Restaurar toda la matriz
        </Button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">
            Matriz de características por rol: filas agrupadas por categoría, columnas por rol
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left text-[10px] uppercase tracking-wide text-content-muted"
              >
                Característica
              </th>
              {roles.map((role) => (
                <th
                  key={role.code}
                  scope="col"
                  className="px-2 py-2 text-center text-[10px] uppercase tracking-wide text-content-muted"
                >
                  <span className="block normal-case">{role.name}</span>
                  <span className="mt-1 flex flex-col items-center gap-1">
                    <Badge
                      color="var(--color-info)"
                      title={`Características activas de ${role.name}`}
                    >
                      {`${counters.get(role.code) ?? 0}/${features.length}`}
                    </Badge>
                    {role.has_full_access && (
                      <Badge color="var(--color-acid)">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        Total
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => void restoreDefaults(role)}
                      className="text-[10px] normal-case text-content-muted underline hover:text-content-primary"
                    >
                      Restaurar
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {grouped.map(({ category, items }) => {
            const open = !collapsed.has(category.code);
            return (
              <tbody key={category.code} className="border-b border-line">
                <tr className="bg-surface-sunken">
                  <th scope="row" className="sticky left-0 z-10 bg-surface-sunken py-2 pr-3 text-left">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(category.code)}
                      aria-expanded={open}
                      aria-controls={`grupo-${category.code}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-content-primary"
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {category.name}
                      <span className="font-normal text-content-muted">({items.length})</span>
                    </button>
                  </th>
                  {roles.map((role) => {
                    const toggleable = items.filter((feature) => !isLockedCell(role, feature));
                    const allOn =
                      toggleable.length > 0 &&
                      toggleable.every((feature) => isEnabled(entries, role, feature));
                    const groupKey = `${role.code}::${category.code}`;
                    return (
                      <td key={role.code} className="px-2 py-2 text-center">
                        <label className="inline-flex cursor-pointer items-center justify-center gap-1">
                          <input
                            type="checkbox"
                            className="accent-[color:var(--color-acid)]"
                            aria-label={`Toda la categoría ${category.name} para ${role.name}`}
                            checked={allOn}
                            disabled={toggleable.length === 0 || busyGroup === groupKey}
                            onChange={() =>
                              void toggleCategory(role, category.code, items, !allOn)
                            }
                          />
                          {busyGroup === groupKey && (
                            <Loader2 className="h-3 w-3 animate-spin text-content-muted" aria-hidden />
                          )}
                        </label>
                      </td>
                    );
                  })}
                </tr>

                {open &&
                  items.map((feature) => (
                    <tr key={feature.code} id={`grupo-${category.code}`} className="border-t border-line">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left font-normal"
                      >
                        <span className="flex flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-content-secondary">{feature.name}</span>
                            {feature.is_sensitive && (
                              <Badge color="var(--color-warning)" title="Característica sensible">
                                <ShieldAlert className="h-3 w-3" aria-hidden />
                                Sensible
                              </Badge>
                            )}
                            {feature.is_core && (
                              <Badge color="var(--color-acid)" title="Característica núcleo">
                                <Lock className="h-3 w-3" aria-hidden />
                                Núcleo
                              </Badge>
                            )}
                          </span>
                          <span className="font-mono text-[10px] text-content-muted">{feature.code}</span>
                          {feature.description && (
                            <span className="text-[10px] text-content-muted">{feature.description}</span>
                          )}
                        </span>
                      </th>

                      {roles.map((role) => {
                        const key = cellKey(role.code, feature.code);
                        const locked = isLockedCell(role, feature);
                        const checked = isEnabled(entries, role, feature);
                        const lockNote = `Bloqueada: ${feature.name} es una característica núcleo y ${role.name} tiene acceso total. No puede desactivarse para que nadie quede fuera del panel.`;
                        return (
                          <td
                            key={role.code}
                            className={
                              feature.is_sensitive
                                ? 'bg-state-warning/5 px-2 py-2 text-center'
                                : 'px-2 py-2 text-center'
                            }
                          >
                            <span className="inline-flex items-center justify-center gap-1">
                              <input
                                type="checkbox"
                                className="accent-[color:var(--color-acid)]"
                                aria-label={`${feature.name} para ${role.name}`}
                                aria-describedby={locked ? `nucleo-${key}` : undefined}
                                title={locked ? lockNote : `${feature.name} · ${role.name}`}
                                checked={checked}
                                disabled={locked || busyCell === key}
                                onChange={() => void toggleCell(role, feature)}
                              />
                              {locked && (
                                <>
                                  <Lock className="h-3 w-3 text-content-muted" aria-hidden />
                                  <span id={`nucleo-${key}`} className="sr-only">
                                    {lockNote}
                                  </span>
                                </>
                              )}
                              {busyCell === key && (
                                <Loader2 className="h-3 w-3 animate-spin text-content-muted" aria-hidden />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>

      <p className="text-[11px] text-content-muted">
        Las celdas con candado están bloqueadas por ser características núcleo en un rol de acceso total.
        Los cambios se aplican de inmediato y quedan registrados en auditoría.
      </p>
    </div>
  );
}
