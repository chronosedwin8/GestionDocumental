import { useEffect, useState } from 'react';
import { Eye, Info, PenLine, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import * as accessApi from '@/api/access';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { AccessMatrixEntry } from '@/types/api';

function keyOf(roleCode: string, moduleCode: string): string {
  return `${roleCode}::${moduleCode}`;
}

/**
 * Matriz de acceso construida desde `catalogs.roles × catalogs.modules`:
 * nunca desde una lista fija de roles (hallazgo 1.3 del plan).
 */
export function RolesTab(): React.JSX.Element {
  const { roles, activeModules } = useCatalogs();
  const matrix = useQuery('access:matrix', () => accessApi.getMatrix());
  const [entries, setEntries] = useState<Map<string, AccessMatrixEntry>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!matrix.data) return;
    setEntries(new Map(matrix.data.map((entry) => [keyOf(entry.role_code, entry.module_code), entry])));
  }, [matrix.data]);

  const get = (roleCode: string, moduleCode: string): AccessMatrixEntry =>
    entries.get(keyOf(roleCode, moduleCode)) ?? {
      role_code: roleCode,
      module_code: moduleCode,
      can_read: false,
      can_write: false,
    };

  const toggle = async (
    roleCode: string,
    moduleCode: string,
    field: 'can_read' | 'can_write',
  ): Promise<void> => {
    const current = get(roleCode, moduleCode);
    const next: AccessMatrixEntry = { ...current, [field]: !current[field] };
    // Escribir implica leer.
    if (field === 'can_write' && next.can_write) next.can_read = true;
    if (field === 'can_read' && !next.can_read) next.can_write = false;

    const cellKey = keyOf(roleCode, moduleCode);
    setSaving(cellKey);
    const previous = new Map(entries);
    setEntries((prev) => new Map(prev).set(cellKey, next));

    try {
      await accessApi.setMatrixEntry(next);
    } catch (err) {
      setEntries(previous);
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el permiso.');
    } finally {
      setSaving(null);
    }
  };

  if (matrix.error) return <ApiErrorState error={matrix.error} onRetry={() => void matrix.refetch()} />;
  if (matrix.loading) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-4">
      <div className="panel flex items-start gap-2 text-xs text-content-muted">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
        <p>
          Los roles con acceso total leen y escriben en todas las dependencias sin importar la matriz. Un
          usuario con módulos propios asignados ignora esta matriz (override individual).
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Matriz de acceso por rol y dependencia</caption>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left text-[10px] uppercase tracking-wide text-content-muted"
              >
                Dependencia
              </th>
              {roles.map((role) => (
                <th
                  key={role.code}
                  scope="col"
                  className="px-2 py-2 text-center text-[10px] uppercase tracking-wide text-content-muted"
                >
                  <span className="block">{role.name}</span>
                  {role.has_full_access && (
                    <Badge color="var(--color-acid)" className="mt-1">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      Total
                    </Badge>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeModules.map((module) => (
              <tr key={module.code} className="border-b border-line last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface-raised py-2 pr-3 text-left text-xs font-medium text-content-secondary"
                >
                  {module.name}
                </th>
                {roles.map((role) => {
                  const entry = get(role.code, module.code);
                  const cellKey = keyOf(role.code, module.code);
                  const locked = role.has_full_access;
                  return (
                    <td key={role.code} className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Tooltip content={`Leer · ${role.name} · ${module.name}`}>
                          <label className="inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              className="accent-[color:var(--color-acid)]"
                              aria-label={`Permiso de lectura de ${role.name} en ${module.name}`}
                              checked={locked || entry.can_read}
                              disabled={locked || saving === cellKey}
                              onChange={() => void toggle(role.code, module.code, 'can_read')}
                            />
                            <Eye className="ml-1 h-3 w-3 text-content-muted" aria-hidden />
                          </label>
                        </Tooltip>
                        <Tooltip content={`Escribir · ${role.name} · ${module.name}`}>
                          <label className="inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              className="accent-[color:var(--color-acid)]"
                              aria-label={`Permiso de escritura de ${role.name} en ${module.name}`}
                              checked={locked || entry.can_write}
                              disabled={locked || saving === cellKey}
                              onChange={() => void toggle(role.code, module.code, 'can_write')}
                            />
                            <PenLine className="ml-1 h-3 w-3 text-content-muted" aria-hidden />
                          </label>
                        </Tooltip>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
