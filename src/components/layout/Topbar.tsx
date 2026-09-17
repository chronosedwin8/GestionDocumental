import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  HelpCircle,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useHelp } from '@/contexts/HelpContext';
import { useTheme } from '@/contexts/ThemeContext';
import { initials } from '@/lib/format';
import { Tooltip } from '@/components/ui/Tooltip';
import type { StreamStatus } from '@/hooks/useNotificationsStream';

export interface TopbarProps {
  onOpenSidebar: () => void;
  /** Abre la paleta de comandos (Ctrl+K). */
  onOpenPalette: () => void;
  unreadCount: number;
  streamStatus: StreamStatus;
}

export function Topbar({
  onOpenSidebar,
  onOpenPalette,
  unreadCount,
  streamStatus,
}: TopbarProps): React.JSX.Element {
  const { user, logout, isAdminArea } = useAuth();
  const { roleLabel } = useCatalogs();
  const { openHelp } = useHelp();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  const handleLogout = async (): Promise<void> => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const streamLabel: Record<StreamStatus, string> = {
    idle: 'Notificaciones en tiempo real inactivas',
    connecting: 'Conectando con el servidor de notificaciones',
    open: 'Notificaciones en tiempo real activas',
    reconnecting: 'Reconectando con el servidor de notificaciones',
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-2 border-b border-line bg-surface-sunken/95 px-3 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Abrir menú de navegación"
        className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-overlay md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={onOpenPalette}
        aria-keyshortcuts="Control+K"
        aria-label="Abrir búsqueda global (Ctrl+K)"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-overlay px-3 py-1.5 text-left text-content-muted transition-colors hover:border-acid-border sm:max-w-sm"
      >
        <Search className="h-4 w-4 flex-shrink-0" aria-hidden />
        <span className="hidden truncate text-xs sm:block">Buscar en todo el archivo…</span>
        <span className="flex-1" />
        <span className="kbd hidden sm:inline">Ctrl</span>
        <span className="kbd hidden sm:inline">K</span>
      </button>

      <div className="flex-1" />

      <Tooltip content="Ayuda de esta pantalla (Ctrl+/)">
        <button
          type="button"
          onClick={() => openHelp({})}
          aria-keyshortcuts="Control+/"
          aria-label="Abrir la ayuda (Ctrl+/)"
          className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-overlay"
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
        </button>
      </Tooltip>

      <Tooltip content={streamLabel[streamStatus]}>
        <span
          aria-label={streamLabel[streamStatus]}
          className={cn(
            'h-2 w-2 rounded-full',
            streamStatus === 'open' && 'bg-state-success',
            streamStatus === 'reconnecting' && 'animate-pulse bg-state-warning',
            streamStatus === 'connecting' && 'animate-pulse bg-content-muted',
            streamStatus === 'idle' && 'bg-content-disabled',
          )}
        />
      </Tooltip>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-overlay"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      </button>

      <Link
        to="/notificaciones"
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        className="relative rounded-lg p-2 text-content-secondary no-underline transition-colors hover:bg-surface-overlay hover:no-underline"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-acid px-1 text-[9px] font-bold text-[color:var(--color-acid-fg)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 transition-colors hover:bg-surface-overlay"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-acid-soft font-mono text-[11px] font-bold text-acid">
            {initials(user?.full_name)}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[140px] truncate text-xs font-medium text-content-primary">
              {user?.full_name ?? 'Usuario'}
            </span>
            <span className="block max-w-[140px] truncate text-[10px] text-content-muted">
              {roleLabel(user?.role_code)}
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-content-muted transition-transform', menuOpen && 'rotate-180')}
            aria-hidden
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface-raised shadow-[var(--shadow-pop)]"
          >
            <div className="border-b border-line px-3 py-2.5">
              <p className="truncate text-sm font-medium text-content-primary">{user?.full_name}</p>
              <p className="truncate text-xs text-content-muted">{user?.email}</p>
              {isAdminArea && (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-acid">
                  <Shield className="h-3 w-3" aria-hidden />
                  Acceso administrativo
                </p>
              )}
            </div>
            <Link
              to="/cambiar-contrasena"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-content-secondary no-underline transition-colors hover:bg-surface-overlay hover:text-content-primary hover:no-underline"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Cambiar contraseña
            </Link>
            <Link
              to="/notificaciones"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-content-secondary no-underline transition-colors hover:bg-surface-overlay hover:text-content-primary hover:no-underline"
            >
              <UserIcon className="h-4 w-4" aria-hidden />
              Mis notificaciones
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2.5 border-t border-line px-3 py-2 text-left text-sm text-state-danger transition-colors hover:bg-state-danger/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
