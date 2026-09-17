import { MonitorSmartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import * as usersApi from '@/api/users';
import { ApiError } from '@/api/client';
import { useDialogs } from '@/contexts/DialogContext';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import type { User } from '@/types/api';

export interface UserSessionsDialogProps {
  user: User;
  onClose: () => void;
}

/** Sesiones activas de un usuario (`GET`/`DELETE /users/:id/sessions`). */
export function UserSessionsDialog({ user, onClose }: UserSessionsDialogProps): React.JSX.Element {
  const { confirm } = useDialogs();
  const key = `users:${user.id}:sessions`;
  const sessions = useQuery(key, () => usersApi.listUserSessions(user.id), { staleTime: 0 });

  const active = (sessions.data ?? []).filter((session) => session.revoked_at === null);

  const revokeAll = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Cerrar todas las sesiones',
      message: `${user.full_name} tendrá que iniciar sesión de nuevo en todos sus dispositivos.`,
      tone: 'danger',
      confirmLabel: 'Cerrar sesiones',
    });
    if (!ok) return;
    try {
      await usersApi.revokeUserSessions(user.id);
      invalidatePrefix(key);
      await sessions.refetch();
      toast.success('Sesiones cerradas.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron cerrar las sesiones.');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Sesiones de ${user.full_name}`}
      description="Cada sesión corresponde a un token de refresco emitido por el servidor."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="danger" disabled={active.length === 0} onClick={() => void revokeAll()}>
            Cerrar todas las sesiones
          </Button>
        </>
      }
    >
      {sessions.error ? (
        <ApiErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : sessions.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (sessions.data ?? []).length === 0 ? (
        <EmptyState
          icon={<MonitorSmartphone className="h-8 w-8" />}
          title="Sin sesiones registradas"
          description="Este usuario no tiene sesiones abiertas en este momento."
        />
      ) : (
        <ul className="space-y-2">
          {(sessions.data ?? []).map((session) => (
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
                  {session.ip ?? 'IP desconocida'} · inicio {formatDateTime(session.created_at)} ·
                  expira {formatDateTime(session.expires_at)}
                </p>
              </div>
              <Badge color={session.revoked_at ? 'var(--color-danger)' : 'var(--color-success)'}>
                {session.revoked_at ? 'Revocada' : 'Activa'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
