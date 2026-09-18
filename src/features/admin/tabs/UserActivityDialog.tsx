import { Activity } from 'lucide-react';
import * as usersApi from '@/api/users';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import type { User } from '@/types/api';

export interface UserActivityDialogProps {
  user: User;
  onClose: () => void;
}

/** Actividad reciente del usuario (`GET /users/:id/activity`, de `audit_logs`). */
export function UserActivityDialog({ user, onClose }: UserActivityDialogProps): React.JSX.Element {
  const activity = useQuery(
    `users:${user.id}:activity`,
    (signal) => usersApi.getUserActivity(user.id, { limit: 50 }, signal),
    { staleTime: 0 },
  );

  const rows = activity.data ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Actividad de ${user.full_name}`}
      description="Últimas acciones registradas en la auditoría del sistema."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {activity.error ? (
        <ApiErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : activity.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-8 w-8" />}
          title="Sin actividad registrada"
          description="Este usuario todavía no tiene acciones en la auditoría, o tu rol no puede consultarla."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-line bg-surface-sunken px-3 py-2"
            >
              <p className="text-xs text-content-primary">
                <span className="font-mono">{log.action}</span>
                {log.resource_type && (
                  <span className="text-content-muted"> · {log.resource_type}</span>
                )}
              </p>
              <p className="text-[10px] text-content-muted">
                {formatDateTime(log.created_at)}
                {log.ip_address ? ` · ${log.ip_address}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
