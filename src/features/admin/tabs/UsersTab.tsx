import { useMemo, useState } from 'react';
import { KeyRound, MonitorSmartphone, Plus, Search, ToggleLeft, ToggleRight, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import * as usersApi from '@/api/users';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate } from '@/lib/format';
import { UserSessionsDialog } from './UserSessionsDialog';
import type { User } from '@/types/api';
import type { Column } from '@/types/ui';

interface UserForm {
  id: string | null;
  email: string;
  full_name: string;
  role_code: string;
  department_code: string;
  /** Cadena vacía = sin override individual (allowed_modules = null). */
  allowed_modules: string[] | null;
}

export function UsersTab(): React.JSX.Element {
  const { roles, activeModules, roleLabel, moduleLabel } = useCatalogs();
  const { confirm } = useDialogs();
  const pagination = usePagination({ initialSort: 'full_name', initialOrder: 'asc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [roleFilter, setRoleFilter] = useState('');
  const [form, setForm] = useState<UserForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [sessionsFor, setSessionsFor] = useState<User | null>(null);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      sort: pagination.sort,
      order: pagination.order,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
    }),
    [pagination.page, pagination.pageSize, pagination.sort, pagination.order, debounced, roleFilter],
  );

  const users = useQuery(`users:${JSON.stringify(query)}`, (signal) => usersApi.listUsers(query, signal));

  const save = async (): Promise<void> => {
    if (!form) return;
    if (!form.email.trim() || !form.full_name.trim() || !form.role_code) {
      toast.error('Correo, nombre y rol son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await usersApi.updateUser(form.id, {
          full_name: form.full_name.trim(),
          role_code: form.role_code,
          department_code: form.department_code || null,
          allowed_modules: form.allowed_modules,
        });
        toast.success('Usuario actualizado.');
      } else {
        const created = await usersApi.createUser({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role_code: form.role_code,
          ...(form.department_code ? { department_code: form.department_code } : {}),
          ...(form.allowed_modules ? { allowed_modules: form.allowed_modules } : {}),
        });
        if (created.temporary_password) setTemporaryPassword(created.temporary_password);
        toast.success('Usuario creado.');
      }
      setForm(null);
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (user: User): Promise<void> => {
    const ok = await confirm({
      title: 'Restablecer contraseña',
      message: `Se generará una contraseña temporal para ${user.full_name} y se cerrarán todas sus sesiones.`,
      confirmLabel: 'Restablecer',
    });
    if (!ok) return;
    try {
      const result = await usersApi.resetUserPassword(user.id);
      setTemporaryPassword(result.temporary_password);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña.');
    }
  };

  const toggleActive = async (user: User): Promise<void> => {
    const ok = await confirm({
      title: user.is_active ? 'Desactivar usuario' : 'Activar usuario',
      message: user.is_active
        ? `${user.full_name} no podrá iniciar sesión.`
        : `${user.full_name} volverá a tener acceso.`,
      tone: user.is_active ? 'danger' : 'default',
      confirmLabel: user.is_active ? 'Desactivar' : 'Activar',
    });
    if (!ok) return;
    try {
      if (user.is_active) await usersApi.deactivateUser(user.id);
      else await usersApi.activateUser(user.id);
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const columns = useMemo<Column<User>[]>(
    () => [
      {
        key: 'name',
        header: 'Usuario',
        sortField: 'full_name',
        primary: true,
        required: true,
        render: (user) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content-primary">{user.full_name}</p>
            <p className="truncate text-[11px] text-content-muted">{user.email}</p>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Rol',
        sortField: 'role_code',
        render: (user) => <Badge>{roleLabel(user.role_code)}</Badge>,
      },
      {
        key: 'department',
        header: 'Dependencia',
        render: (user) => (
          <span className="text-xs text-content-secondary">
            {user.department_code ? moduleLabel(user.department_code) : '—'}
          </span>
        ),
      },
      {
        key: 'override',
        header: 'Módulos propios',
        render: (user) =>
          user.allowed_modules && user.allowed_modules.length > 0 ? (
            <span className="text-[11px] text-content-muted">
              {user.allowed_modules.length} módulo(s)
            </span>
          ) : (
            <span className="text-[11px] text-content-muted">Según rol</span>
          ),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (user) => (
          <div className="flex flex-wrap gap-1">
            <Badge color={user.is_active ? 'var(--color-success)' : 'var(--color-danger)'}>
              {user.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            {user.must_change_password && <Badge color="var(--color-warning)">Debe cambiar clave</Badge>}
          </div>
        ),
      },
      {
        key: 'last_login',
        header: 'Último ingreso',
        sortField: 'last_login_at',
        render: (user) => (
          <span className="whitespace-nowrap text-xs text-content-muted">
            {formatDate(user.last_login_at)}
          </span>
        ),
      },
    ],
    [roleLabel, moduleLabel],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Filtros de usuarios">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar por nombre o correo…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            pagination.setPage(1);
          }}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar usuarios"
        />
        <Select
          className="w-48"
          aria-label="Filtrar por rol"
          placeholder="Todos los roles"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            pagination.setPage(1);
          }}
          options={roles.map((role) => ({ value: role.code, label: role.name }))}
        />
        <div className="flex-1" />
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            setForm({
              id: null,
              email: '',
              full_name: '',
              role_code: roles[0]?.code ?? '',
              department_code: '',
              allowed_modules: null,
            })
          }
        >
          Nuevo usuario
        </Button>
      </Toolbar>

      {users.error ? (
        <ApiErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={users.data?.data ?? []}
          rowKey={(user) => user.id}
          loading={users.loading}
          sort={pagination.sort}
          order={pagination.order}
          onSortChange={pagination.toggleSort}
          page={users.data?.page ?? pagination.page}
          pageSize={users.data?.pageSize ?? pagination.pageSize}
          total={users.data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          emptyTitle="Sin usuarios"
          caption="Usuarios del sistema"
          rowActions={(user) => (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar ${user.full_name}`}
                onClick={() =>
                  setForm({
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    role_code: user.role_code,
                    department_code: user.department_code ?? '',
                    allowed_modules: user.allowed_modules,
                  })
                }
                icon={<UserCog className="h-4 w-4" />}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Ver sesiones de ${user.full_name}`}
                onClick={() => setSessionsFor(user)}
                icon={<MonitorSmartphone className="h-4 w-4" />}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Restablecer contraseña de ${user.full_name}`}
                onClick={() => void resetPassword(user)}
                icon={<KeyRound className="h-4 w-4" />}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={user.is_active ? `Desactivar ${user.full_name}` : `Activar ${user.full_name}`}
                onClick={() => void toggleActive(user)}
                icon={
                  user.is_active ? (
                    <ToggleRight className="h-4 w-4 text-state-success" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-content-muted" />
                  )
                }
              />
            </>
          )}
        />
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          title={form.id ? 'Editar usuario' : 'Nuevo usuario'}
          description={
            form.id ? undefined : 'Se generará una contraseña temporal que el usuario deberá cambiar.'
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <FormField label="Correo" required>
              <Input
                data-autofocus
                type="email"
                value={form.email}
                disabled={form.id !== null}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="Nombre completo" required>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Rol" required>
                <Select
                  value={form.role_code}
                  onChange={(e) => setForm({ ...form, role_code: e.target.value })}
                  options={roles.map((role) => ({ value: role.code, label: role.name }))}
                />
              </FormField>
              <FormField label="Dependencia principal">
                <Select
                  placeholder="Sin asignar"
                  value={form.department_code}
                  onChange={(e) => setForm({ ...form, department_code: e.target.value })}
                  options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
                />
              </FormField>
            </div>

            <fieldset className="rounded-lg border border-line p-3">
              <legend className="px-1 text-xs font-medium text-content-secondary">
                Módulos permitidos (override individual)
              </legend>
              <label className="mb-2 flex items-center gap-2 text-xs text-content-muted">
                <input
                  type="checkbox"
                  className="accent-[color:var(--color-acid)]"
                  checked={form.allowed_modules === null}
                  onChange={(e) => setForm({ ...form, allowed_modules: e.target.checked ? null : [] })}
                />
                Usar los permisos del rol
              </label>
              {form.allowed_modules !== null && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {activeModules.map((module) => (
                    <label key={module.code} className="flex items-center gap-2 text-xs text-content-secondary">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--color-acid)]"
                        checked={form.allowed_modules?.includes(module.code) ?? false}
                        onChange={(e) => {
                          const current = form.allowed_modules ?? [];
                          setForm({
                            ...form,
                            allowed_modules: e.target.checked
                              ? [...current, module.code]
                              : current.filter((code) => code !== module.code),
                          });
                        }}
                      />
                      {module.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        </Dialog>
      )}

      {sessionsFor && <UserSessionsDialog user={sessionsFor} onClose={() => setSessionsFor(null)} />}

      {temporaryPassword && (
        <Dialog
          open
          onClose={() => setTemporaryPassword(null)}
          title="Contraseña temporal"
          description="Cópiala y entrégala al usuario por un canal seguro: no volverá a mostrarse."
          size="sm"
          footer={
            <Button variant="primary" onClick={() => setTemporaryPassword(null)}>
              Entendido
            </Button>
          }
        >
          <p className="select-all break-all rounded-lg border border-acid-border bg-acid-soft p-3 text-center font-mono text-lg text-acid">
            {temporaryPassword}
          </p>
        </Dialog>
      )}
    </div>
  );
}
