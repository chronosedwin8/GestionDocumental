import { NavLink } from 'react-router-dom';
import { BarChart2, FolderOpen, LayoutDashboard, Search, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { to: '/', end: true, label: 'Inicio', icon: LayoutDashboard },
  { to: '/buscar', label: 'Buscar', icon: Search },
  { to: '/expedientes', label: 'Expedientes', icon: FolderOpen },
  { to: '/estadisticas', label: 'Métricas', icon: BarChart2 },
  { to: '/personas', label: 'Personas', icon: UserRound },
];

/** Barra inferior sólo en móvil, con los destinos más usados. */
export function MobileNav(): React.JSX.Element {
  return (
    <nav
      aria-label="Navegación rápida"
      className="sticky bottom-0 z-30 flex flex-shrink-0 border-t border-line bg-surface-sunken md:hidden"
    >
      {ITEMS.map(({ to, end, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] no-underline transition-colors hover:no-underline',
              isActive ? 'text-acid' : 'text-content-muted',
            )
          }
        >
          <Icon className="h-5 w-5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
