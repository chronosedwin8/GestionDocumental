import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface BadgeProps {
  children: ReactNode;
  /** Color arbitrario del catálogo (hex o css color). */
  color?: string;
  variant?: 'soft' | 'solid' | 'outline';
  className?: string;
  title?: string;
}

/**
 * El color viene del catálogo, por eso se aplica en línea y no con clases
 * de Tailwind (que se purgarían al no existir en el código).
 */
export function Badge({
  children,
  color,
  variant = 'soft',
  className,
  title,
}: BadgeProps): React.JSX.Element {
  const style =
    color && variant === 'soft'
      ? { color, backgroundColor: `${color}1a`, borderColor: `${color}40` }
      : color && variant === 'solid'
        ? { color: 'var(--text-inverted)', backgroundColor: color, borderColor: color }
        : color
          ? { color, borderColor: `${color}66` }
          : undefined;

  return (
    <span
      title={title}
      style={style}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium',
        !color && 'border-line bg-surface-overlay text-content-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}
