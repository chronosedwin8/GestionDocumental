import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as meApi from '@/api/me';
import * as systemApi from '@/api/system';
import * as usersApi from '@/api/users';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatDateTime } from '@/lib/format';
import { passwordStatus, passwordStatusColor } from '@/lib/password';
import { PasswordStrength } from './PasswordStrength';

/** Pantalla "Mi perfil": disponible para cualquier usuario autenticado. */
export default function ProfilePage(): React.JSX.Element {
  const { user, reloadMe, changePassword, effectiveModules, effectiveFeatures } = useAuth();
  const { moduleLabel, moduleColor, roleLabel, featureLabel, features, featureCategoryLabel, feature } =
    useCatalogs();
  const { confirm } = useDialogs();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const policy = useQuery('system:password-policy', (signal) => systemApi.getPasswordPolicy(signal));
  const sessions = useQuery(
    user ? `users:${user.id}:sessions` : null,
    (signal) => usersApi.listUserSessions(user?.id ?? '', signal),
    { staleTime: 0 },
  );

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setPhone(user.phone ?? '');
    setPosition(user.position ?? '');
  }, [user]);

  /** Características habilitadas, agrupadas por categoría del catálogo. */
  const featureGroups = useMemo(() => {
    if (!effectiveFeatures) return null;
    const enabled = new Set(effectiveFeatures);
    const groups = new Map<string, string[]>();
    for (const code of effectiveFeatures) {
      const meta = feature(code);
      const category = meta?.category_code ?? 'SIN_CATEGORIA';
      const list = groups.get(category) ?? [];
      list.push(code);
      groups.set(category, list);
    }
    // Se ordenan las categorías según el catálogo, no alfabéticamente.
    const order = new Map(features.map((entry, index) => [entry.category_code, index]));
    return {
      total: enabled.size,
      groups: [...groups.entries()].sort(
        (a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999),
      ),
    };
  }, [effectiveFeatures, feature, features]);

  if (!user) return <Skeleton className="h-64 w-full" />;

  const status = passwordStatus(user);

  const saveProfile = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error('El nombre no puede quedar vacío.');
      return;
    }
    setSavingProfile(true);
    try {
      await meApi.updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        position: position.trim() || null,
      });
      await reloadMe();
      toast.success('Perfil actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPasswordError(null);
    if (next !== repeat) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }
    if (next === current) {
      setPasswordError('La nueva contraseña debe ser distinta de la actual.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast.success('Contraseña actualizada.');
    } catch (err) {
      // 422 PASSWORD_REUSED y los fallos de política llegan con el mensaje
      // exacto del servidor: se muestra tal cual.
      setPasswordError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  const closeOtherSessions = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Cerrar sesión en otros dispositivos',
      message:
        'Se revocarán todas tus sesiones. Tendrás que iniciar sesión de nuevo en este y en los demás dispositivos.',
      tone: 'danger',
      confirmLabel: 'Cerrar sesiones',
    });
    if (!ok) return;
    try {
      await usersApi.revokeUserSessions(user.id);
      await sessions.refetch();
      toast.success('Sesiones cerradas.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron cerrar las sesiones.');
    }
  };

  const activeSessions = (sessions.data ?? []).filter((session) => session.revoked_at === null);

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Tus datos, tu contraseña, tus dependencias y tus sesiones."
        icon={<UserRound className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi perfil' }]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Datos personales */}
        <section className="panel">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <UserRound className="h-4 w-4 text-acid" aria-hidden />
            Datos personales
          </h2>
          <form className="space-y-3" onSubmit={(e) => void saveProfile(e)}>
            <FormField label="Correo" hint="El correo identifica la cuenta y no se edita aquí.">
              <Input value={user.email} disabled readOnly />
            </FormField>
            <FormField label="Nombre completo" required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Teléfono">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </FormField>
              <FormField label="Cargo">
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
              <Badge>{roleLabel(user.role_code)}</Badge>
              {user.department_code && (
                <Badge color={moduleColor(user.department_code)}>
                  {moduleLabel(user.department_code)}
                </Badge>
              )}
              <span>Alta {formatDate(user.created_at)}</span>
            </div>
            <Button type="submit" variant="primary" loading={savingProfile}>
              Guardar cambios
            </Button>
          </form>
        </section>

        {/* Contraseña */}
        <section className="panel">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <KeyRound className="h-4 w-4 text-acid" aria-hidden />
            Contraseña
          </h2>

          <p className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
            <Badge color={passwordStatusColor(status.state)}>{status.label}</Badge>
            {user.password_changed_at && <span>Último cambio {formatDate(user.password_changed_at)}</span>}
            {user.password_expires_at && <span>Vence {formatDate(user.password_expires_at)}</span>}
          </p>

          <form className="space-y-3" onSubmit={(e) => void submitPassword(e)}>
            {passwordError && (
              <p
                role="alert"
                className="rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-xs text-state-danger"
              >
                {passwordError}
              </p>
            )}
            <FormField label="Contraseña actual" required>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </FormField>
            <FormField label="Nueva contraseña" required>
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </FormField>

            <PasswordStrength
              password={next}
              policy={policy.data ?? null}
              policyError={policy.error?.message ?? null}
            />

            <FormField label="Repite la nueva contraseña" required>
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="primary" loading={savingPassword}>
              Cambiar contraseña
            </Button>
          </form>
        </section>

        {/* Dependencias */}
        <section className="panel">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <Building2 className="h-4 w-4 text-acid" aria-hidden />
            Dependencias a las que accedes
          </h2>
          {effectiveModules.length === 0 ? (
            <EmptyState
              title="Sin dependencias asignadas"
              description="Tu rol todavía no tiene acceso a ninguna dependencia. Pídeselo al administrador del archivo."
            />
          ) : (
            <ul className="space-y-2">
              {effectiveModules.map((module) => (
                <li
                  key={module.code}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-content-secondary">
                    {moduleLabel(module.code)}
                  </span>
                  {module.can_read && <Badge color="var(--color-info)">Lectura</Badge>}
                  {module.can_write && <Badge color="var(--color-success)">Escritura</Badge>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Características */}
        <section className="panel">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <ShieldCheck className="h-4 w-4 text-acid" aria-hidden />
            Características habilitadas para tu rol
          </h2>
          {!featureGroups ? (
            <EmptyState
              title="El servidor no publica tus características"
              description="GET /auth/me todavía no devuelve effective_features. Mientras tanto, la interfaz no oculta acciones por característica: el servidor sigue decidiendo."
            />
          ) : featureGroups.total === 0 ? (
            <EmptyState
              title="Sin características habilitadas"
              description="Tu rol no tiene ninguna característica activa. El administrador puede concederlas desde Administración › Características por rol."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-content-muted">
                {featureGroups.total} característica(s) habilitadas.
              </p>
              {featureGroups.groups.map(([category, codes]) => (
                <div key={category}>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-content-muted">
                    {featureCategoryLabel(category)}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {codes.map((code) => (
                      <li key={code}>
                        <Badge title={code}>{featureLabel(code)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sesiones */}
        <section className="panel xl:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
            <MonitorSmartphone className="h-4 w-4 text-acid" aria-hidden />
            Sesiones abiertas
          </h2>

          {sessions.error ? (
            <ApiErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          ) : sessions.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : activeSessions.length === 0 ? (
            <EmptyState
              icon={<MonitorSmartphone className="h-8 w-8" />}
              title="Sin sesiones registradas"
              description="No hay sesiones abiertas además de la actual."
            />
          ) : (
            <>
              <ul className="mb-3 space-y-2">
                {activeSessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                  >
                    <MonitorSmartphone className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-content-primary">
                        {session.user_agent ?? 'Cliente desconocido'}
                      </p>
                      <p className="truncate text-[10px] text-content-muted">
                        {session.ip ?? 'IP desconocida'} · inicio {formatDateTime(session.created_at)}
                      </p>
                    </div>
                    <Badge color="var(--color-success)">Activa</Badge>
                  </li>
                ))}
              </ul>
              <Button variant="danger" onClick={() => void closeOtherSessions()}>
                Cerrar sesión en todos los dispositivos
              </Button>
              <p className="mt-2 text-[10px] text-content-muted">
                El contrato solo expone <code className="font-mono">DELETE /users/:id/sessions</code>, que
                revoca todas las sesiones: también la de este navegador.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
