import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { AppNotification, DocumentUpdatedEvent } from '@/types/api';
import toast from 'react-hot-toast';
import * as notificationsApi from '@/api/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { HelpProvider, useHelp } from '@/contexts/HelpContext';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useNotificationsStream } from '@/hooks/useNotificationsStream';
import { invalidatePrefix } from '@/hooks/useQuery';
import { CommandPalette } from '@/components/CommandPalette';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { OnboardingTour } from '@/features/onboarding/OnboardingTour';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Marco de la aplicación: sidebar, topbar y área de contenido. */
function AppShellInner(): React.JSX.Element {
  const { isAuthenticated, tokenVersion } = useAuth();
  const { loading: catalogsLoading, catalogs } = useCatalogs();
  const { openHelp } = useHelp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  // Contador inicial de no leídas.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void notificationsApi
      .unreadCount()
      .then((res) => {
        if (!cancelled) setUnreadCount(res.count);
      })
      .catch(() => {
        /* el badge simplemente no se muestra */
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.pathname === '/notificaciones']);

  const streamStatus = useNotificationsStream(isAuthenticated, tokenVersion, {
    onNotification: useCallback((notification: AppNotification) => {
      setUnreadCount((count) => count + 1);
      invalidatePrefix('notifications:');
      toast(notification.title, { icon: '🔔' });
    }, []),
    onDocumentUpdated: useCallback((event: DocumentUpdatedEvent) => {
      invalidatePrefix(`document:${event.id}`);
      invalidatePrefix(`documents:${event.module_code}`);
    }, []),
  });

  // Atajos globales: Ctrl+K abre la búsqueda, Ctrl+/ la ayuda de la pantalla.
  useHotkeys(
    {
      'mod+k': () => setPaletteOpen(true),
      'mod+/': () => openHelp({}),
    },
    { allowInInputs: true },
  );

  // Cerrar el menú móvil al navegar.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  if (catalogsLoading && !catalogs) {
    return <FullPageSpinner label="Cargando catálogos…" />;
  }

  return (
    <div className="flex min-h-screen w-full bg-surface-base">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-acid focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[color:var(--color-acid-fg)]"
      >
        Saltar al contenido
      </a>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} unreadCount={unreadCount} />

      <div className="flex min-w-0 flex-1 flex-col md:ml-64">
        <Topbar
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          unreadCount={unreadCount}
          streamStatus={streamStatus}
        />

        <main id="contenido" className="flex-1 px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto w-full max-w-[1600px]">
            <Suspense fallback={<FullPageSpinner />}>
              <Outlet context={{ refreshUnread: () => setUnreadCount(0) }} />
            </Suspense>
          </div>
        </main>

        <MobileNav />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <OnboardingTour />
    </div>
  );
}

export function AppShell(): React.JSX.Element {
  return (
    <HelpProvider>
      <AppShellInner />
    </HelpProvider>
  );
}
