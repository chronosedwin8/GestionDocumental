import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ToolbarProps {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/** Barra de filtros/acciones sobre una lista. */
export function Toolbar({ children, className, ariaLabel = 'Herramientas' }: ToolbarProps): React.JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface-raised p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarSpacer(): React.JSX.Element {
  return <div className="flex-1" />;
}
