import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as notificationsApi from '@/api/notifications';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { usePagination } from '@/hooks/usePagination';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { formatDateTime } from '@/lib/format';

export default function NotificationsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { notificationType } = useCatalogs();
  const { confirm } = useDialogs();
  const pagination = usePagination({ initialPageSize: 25 });
  const [onlyUnread, setOnlyUnread] = useState(false);

  const query = useMemo(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...(onlyUnread ? { unread: true } : {}),
    }),
    [pagination.page, pagination.pageSize, onlyUnread],
  );

  const notifications = useQuery(`notifications:${JSON.stringify(query)}`, (signal) =>
    notificationsApi.listNotifications(query, signal),
  );

  const refreshAll = async (): Promise<void> => {
    invalidatePrefix('notifications:');
    await notifications.refetch();
  };

  const markRead = async (id: string): Promise<void> => {
    try {
      await notificationsApi.markRead(id);
      notifications.setData({
        ...(notifications.data ?? { data: [], page: 1, pageSize: 25, total: 0 }),
        data: (notifications.data?.data ?? []).map((item) =>
          item.id === id ? { ...item, is_read: true } : item,
        ),
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo marcar como leída.');
    }
  };

  const markAllRead = async (): Promise<void> => {
    try {
      await notificationsApi.markAllRead();
      await refreshAll();
      toast.success('Todas marcadas como leídas.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar.');
    }
  };

  const dismiss = async (id: string): Promise<void> => {
    try {
      await notificationsApi.dismiss(id);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descartar.');
    }
  };

  const dismissRead = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Borrar notificaciones leídas',
      message: 'Se eliminarán todas las notificaciones que ya has leído.',
      tone: 'danger',
      confirmLabel: 'Borrar leídas',
    });
    if (!ok) return;
    try {
      await notificationsApi.dismissRead();
      await refreshAll();
      toast.success('Notificaciones leídas eliminadas.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo borrar.');
    }
  };

  const items = notifications.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Alertas de retención, préstamos, transferencias y solicitudes."
        icon={<Bell className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Notificaciones' }]}
        actions={
          <>
            <HelpButton contextLabel="Notificaciones" label="Ayuda de notificaciones" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void markAllRead()}
              icon={<CheckCheck className="h-3.5 w-3.5" />}
            >
              Marcar leídas
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void dismissRead()}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Borrar leídas
            </Button>
          </>
        }
      />

      <Tabs
        className="mb-4"
        ariaLabel="Filtro de notificaciones"
        value={onlyUnread ? 'unread' : 'all'}
        onChange={(id) => {
          setOnlyUnread(id === 'unread');
          pagination.setPage(1);
        }}
        items={[
          { id: 'all', label: 'Todas' },
          { id: 'unread', label: 'Sin leer' },
        ]}
      />

      {notifications.error ? (
        <ApiErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" />}
          title={onlyUnread ? 'Sin notificaciones pendientes' : 'Sin notificaciones'}
          description="Aquí aparecerán las alertas del sistema y las acciones que requieren tu atención."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const type = notificationType(item.type_code);
              return (
                <li
                  key={item.id}
                  className={`group flex items-start gap-3 rounded-card border p-3 transition-colors ${
                    item.is_read ? 'border-line bg-surface-raised' : 'border-acid-border bg-acid-soft'
                  }`}
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{
                      color: type?.color ?? 'var(--text-muted)',
                      backgroundColor: `${type?.color ?? '#a1a1aa'}1a`,
                    }}
                  >
                    <DynamicIcon name={type?.icon ?? 'Bell'} className="h-4 w-4" />
                  </span>

                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (!item.is_read) void markRead(item.id);
                      if (item.document_id) navigate(`/documentos/${item.document_id}`);
                    }}
                  >
                    <p className="text-sm font-medium text-content-primary">{item.title}</p>
                    <p className="mt-0.5 text-xs text-content-secondary">{item.message}</p>
                    <p className="mt-1 text-[10px] text-content-muted">
                      {type?.name ?? item.type_code} · {formatDateTime(item.created_at)}
                    </p>
                  </button>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    {!item.is_read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Marcar como leída"
                        onClick={() => void markRead(item.id)}
                        icon={<CheckCheck className="h-4 w-4" />}
                      />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Descartar notificación"
                      onClick={() => void dismiss(item.id)}
                      icon={<X className="h-4 w-4" />}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            className="mt-4"
            page={notifications.data?.page ?? pagination.page}
            pageSize={notifications.data?.pageSize ?? pagination.pageSize}
            total={notifications.data?.total ?? 0}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </>
  );
}
