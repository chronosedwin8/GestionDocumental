import { useMemo, useState } from 'react';
import {
  Activity,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  Plus,
  Search,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Unlock,
  UserCog,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as systemApi from '@/api/system';
import * as usersApi from '@/api/users';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { IfFeature } from '@/components/ui/IfFeature';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate, formatDateTime } from '@/lib/format';
import { passwordStatus, passwordStatusColor } from '@/lib/password';
import { UserActivityDialog } from './UserActivityDialog';
import { UserSessionsDialog } from './UserSessionsDialog';
import type { User } from '@/types/api';
import type { Column } from '@/types/ui';

interface UserForm {
  id: string | null;
  email: string;
  full_name: string;
  phone: string;
  position: string;
  role_code: string;
  department_code: string;
  /** `null` = sin override individual (allowed_modules = null). */
  allowed_modules: string[] | null;
}

/** ¿El bloqueo por intentos fallidos sigue vigente? */
export function isLocked(user: User): boolean {
  if (!user.locked_until) return false;
  const until = new Date(user.locked_until).getTime();
  return !Number.isNaN(until) && until > Date.now();
}

export function UsersTab(): React.JSX.Element {
  const { roles, activeModules, roleLabel, moduleLabel } = useCatalogs();
  const { confirm } = useDialogs();
  const { user: me } = useAuth();
  const pagination = usePagination({ initialSort: 'full_name', initialOrder: 'asc' });
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [roleFilter, setRoleFilter] = useState('');
  const [form, setForm] = useState<UserForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<User | null>(null);
  const [activityFor, setActivityFor] = useState<User | null>(null);

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

  /** La política real del servidor: la vigencia temporal sale de aquí. */
  const policy = useQuery('system:password-policy', (signal) => systemApi.getPasswordPolicy(signal));

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
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
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
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.position.trim() ? { position: form.position.trim() } : {}),
          ...(form.department_code ? { department_code: form.department_code } : {}),
          ...(form.allowed_modules ? { allowed_modules: form.allowed_modules } : {}),
        });
        if (created.temporary_password) {
          setCopied(false);
          setTemporaryPassword(created.temporary_password);
        }
        toast.success('Usuario creado.');
      }
      setForm(null);
      await users.refetch();
    } catch (err) {
      // 409 de las salvaguardas de gobierno (autodegradarse, cuenta
      // fundacional, dejar el sistema sin acceso total): el mensaje del
      // servidor es explícito y se muestra tal cual.
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (user: User): Promise<void> => {
    const hours = policy.data?.temporary_ttl_hours;
    const ok = await confirm({
      title: 'Restablecer contraseña',
      message: `Se generará una contraseña temporal para ${user.full_name} y se cerrarán todas sus sesiones.${
        hours ? ` La temporal caduca en ${hours} hora(s), según la política del servidor.` : ''
      }`,
      confirmLabel: 'Restablecer',
    });
    if (!ok) return;
    try {
      const result = await usersApi.resetUserPassword(user.id);
      setCopied(false);
      setTemporaryPassword(result.temporary_password);
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña.');
    }
  };

  const unlock = async (user: User): Promise<void> => {
    try {
      await usersApi.unlockUser(user.id);
      toast.success(`${user.full_name} puede volver a iniciar sesión.`);
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo desbloquear la cuenta.');
    }
  };

  const forceChange = async (user: User): Promise<void> => {
    const ok = await confirm({
      title: 'Forzar cambio de contraseña',
      message: `${user.full_name} deberá cambiar su contraseña en el próximo inicio de sesión.`,
      confirmLabel: 'Forzar cambio',
    });
    if (!ok) return;
    try {
      await usersApi.forcePasswordChange(user.id);
      toast.success('Se pedirá una contraseña nueva al iniciar sesión.');
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo marcar el cambio de contraseña.');
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
      // `POST /users/:id/deactivate` responde 409 con un mensaje explícito
      // al autodesactivarse o tocar la cuenta administradora fundacional.
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const copyTemporary = async (): Promise<void> => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      toast.error('El navegador no permitió copiar. Selecciona el texto y cópialo a mano.');
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
            {user.position && <p className="truncate text-[10px] text-content-muted">{user.position}</p>}
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
        key: 'password',
        header: 'Contraseña',
        render: (user) => {
          const status = passwordStatus(user);
          return (
            <div className="flex flex-wrap gap-1">
              <Badge color={passwordStatusColor(status.state)}>{status.label}</Badge>
              {user.password_expires_at && status.state !== 'TEMPORAL' && (
                <span className="text-[10px] text-content-muted">
                  hasta {formatDate(user.password_expires_at)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'status',
        header: 'Estado',
        render: (user) => (
          <div className="flex flex-wrap gap-1">
            <Badge color={user.is_active ? 'var(--color-success)' : 'var(--color-danger)'}>
              {user.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            {isLocked(user) && (
              <Badge color="var(--color-danger)" title={`Bloqueada hasta ${formatDateTime(user.locked_until)}`}>
                <LockKeyhole className="h-3 w-3" aria-hidden />
                Bloqueada
              </Badge>
            )}
            {user.failed_attempts !== undefined && user.failed_attempts > 0 && !isLocked(user) && (
              <Badge color="var(--color-warning)">{user.failed_attempts} intento(s) fallido(s)</Badge>
            )}
          </div>
        ),
      },
      {
        key: 'sessions',
        header: 'Sesiones',
        render: (user) =>
          user.active_sessions === undefined ? (
            <span className="text-[11px] text-content-muted">—</span>
          ) : (
            <span className="font-mono text-xs text-content-secondary">{user.active_sessions}</span>
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
        <IfFeature code="USER_MANAGE">
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setForm({
                id: null,
                email: '',
                full_name: '',
                phone: '',
                position: '',
                role_code: roles[0]?.code ?? '',
                department_code: '',
                allowed_modules: null,
              })
            }
          >
            Nuevo usuario
          </Button>
        </IfFeature>
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
              <IfFeature code="USER_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${user.full_name}`}
                  onClick={() =>
                    setForm({
                      id: user.id,
                      email: user.email,
                      full_name: user.full_name,
                      phone: user.phone ?? '',
                      position: user.position ?? '',
                      role_code: user.role_code,
                      department_code: user.department_code ?? '',
                      allowed_modules: user.allowed_modules,
                    })
                  }
                  icon={<UserCog className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="USER_SESSION_REVOKE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Ver sesiones de ${user.full_name}`}
                  onClick={() => setSessionsFor(user)}
                  icon={<MonitorSmartphone className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="AUDIT_VIEW">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Ver actividad de ${user.full_name}`}
                  onClick={() => setActivityFor(user)}
                  icon={<Activity className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="USER_RESET_PASSWORD">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Restablecer contraseña de ${user.full_name}`}
                  onClick={() => void resetPassword(user)}
                  icon={<KeyRound className="h-4 w-4" />}
                />
              </IfFeature>
              <IfFeature code="USER_MANAGE">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Forzar cambio de contraseña de ${user.full_name}`}
                  onClick={() => void forceChange(user)}
                  icon={<ShieldAlert className="h-4 w-4" />}
                />
              </IfFeature>
              {isLocked(user) && (
                <IfFeature code="USER_MANAGE">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Desbloquear ${user.full_name}`}
                    onClick={() => void unlock(user)}
                    icon={<Unlock className="h-4 w-4 text-state-warning" />}
                  />
                </IfFeature>
              )}
              <IfFeature code="USER_MANAGE">
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
              </IfFeature>
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
            form.id
              ? form.id === me?.id
                ? 'Es tu propia cuenta: el servidor impide autodegradarse o autodesactivarse.'
                : undefined
              : 'Se generará una contraseña temporal que el usuario deberá cambiar.'
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
              <FormField label="Teléfono">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </FormField>
              <FormField label="Cargo">
                <Input
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                />
              </FormField>
            </div>
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
      {activityFor && <UserActivityDialog user={activityFor} onClose={() => setActivityFor(null)} />}

      {temporaryPassword && (
        <Dialog
          open
          onClose={() => setTemporaryPassword(null)}
          title="Contraseña temporal"
          description={`Cópiala y entrégala por un canal seguro: no volverá a mostrarse.${
            policy.data ? ` Caduca en ${policy.data.temporary_ttl_hours} hora(s).` : ''
          }`}
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => void copyTemporary()}>
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
              <Button variant="primary" onClick={() => setTemporaryPassword(null)}>
                Entendido
              </Button>
            </>
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
