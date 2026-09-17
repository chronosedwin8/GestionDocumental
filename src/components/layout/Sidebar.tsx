import { NavLink } from 'react-router-dom';
import {
  Archive,
  BarChart2,
  Bell,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  Search,
  Settings,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { DynamicIcon } from '@/components/ui/DynamicIcon';

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  unreadCount: number;
}

interface NavItem {
  to: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  badge?: number;
  end?: boolean;
}

function NavGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: () => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-content-muted">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2 text-left no-underline transition-colors hover:no-underline',
                  isActive
                    ? 'border-acid-border bg-acid-soft text-acid'
                    : 'border-transparent text-content-secondary hover:bg-surface-overlay hover:text-content-primary',
                )
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                {item.description && (
                  <span className="block truncate text-[10px] text-content-muted">{item.description}</span>
                )}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-acid px-1 text-[10px] font-bold text-[color:var(--color-acid-fg)]">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sidebar agrupado (U2). Los módulos vienen del catálogo, ordenados por
 * `sort_order` y filtrados por `effective_modules` — no hay lista fija.
 */
export function Sidebar({ open, onClose, unreadCount }: SidebarProps): React.JSX.Element {
  const { activeModules, moduleColor, moduleDescription } = useCatalogs();
  const { canRead, isAdminArea } = useAuth();

  const moduleItems: NavItem[] = activeModules
    .filter((module) => canRead(module.code))
    .map((module) => ({
      to: `/modulos/${module.code}`,
      label: module.name,
      description: moduleDescription(module.code) || undefined,
      icon: (
        <DynamicIcon
          name={module.icon}
          className="h-5 w-5"
          style={{ color: moduleColor(module.code) }}
        />
      ),
    }));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        aria-label="Navegación principal"
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-line bg-surface-sunken transition-transform duration-200 ease-out md:translate-x-0 md:visible',
          // `invisible` saca los enlaces del orden de tabulación cuando el
          // menú está cerrado en móvil (U8): no basta con desplazarlo fuera.
          open ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-acid-border bg-acid-soft">
            <Archive className="h-5 w-5 text-acid" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-content-primary">EduArchive</p>
            <p className="font-mono text-[10px] tracking-wider text-content-muted">SGDEA v2.0</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="rounded-lg p-1.5 text-content-muted hover:bg-surface-overlay md:hidden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavGroup
            title="Operación"
            onNavigate={onClose}
            items={[
              {
                to: '/',
                end: true,
                label: 'Dashboard',
                description: 'Panel principal',
                icon: <LayoutDashboard className="h-5 w-5 text-acid" aria-hidden />,
              },
              ...moduleItems,
            ]}
          />

          <NavGroup
            title="Archivo"
            onNavigate={onClose}
            items={[
              {
                to: '/personas',
                label: 'Personas',
                description: 'Hojas de vida y expedientes académicos',
                icon: <UserRound className="h-5 w-5 text-acid" aria-hidden />,
              },
              {
                to: '/expedientes',
                label: 'Expedientes',
                description: 'Expedientes y correspondencia',
                icon: <FolderOpen className="h-5 w-5 text-state-warning" aria-hidden />,
              },
              {
                to: '/trd',
                label: 'TRD / Retención',
                description: 'Tablas de retención',
                icon: <FileSpreadsheet className="h-5 w-5 text-state-info" aria-hidden />,
              },
              {
                to: '/papelera',
                label: 'Papelera',
                description: 'Documentos eliminados',
                icon: <Trash2 className="h-5 w-5 text-state-danger" aria-hidden />,
              },
            ]}
          />

          <NavGroup
            title="Análisis"
            onNavigate={onClose}
            items={[
              {
                to: '/buscar',
                label: 'Búsqueda',
                description: 'Semántica y avanzada',
                icon: <Search className="h-5 w-5 text-content-muted" aria-hidden />,
              },
              {
                to: '/estadisticas',
                label: 'Estadísticas',
                description: 'KPIs y tendencias',
                icon: <BarChart2 className="h-5 w-5 text-acid" aria-hidden />,
              },
              {
                to: '/notificaciones',
                label: 'Notificaciones',
                description: 'Alertas del sistema',
                icon: <Bell className="h-5 w-5 text-content-muted" aria-hidden />,
                badge: unreadCount,
              },
            ]}
          />

          {isAdminArea && (
            <NavGroup
              title="Administración"
              onNavigate={onClose}
              items={[
                {
                  to: '/admin',
                  label: 'Panel Admin',
                  description: 'Configuración del sistema',
                  icon: <Settings className="h-5 w-5 text-state-danger" aria-hidden />,
                },
              ]}
            />
          )}
        </nav>
      </aside>
    </>
  );
}
