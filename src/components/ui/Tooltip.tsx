import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
  className?: string;
}

/** Tooltip accesible: se muestra con hover y con foco de teclado. */
export function Tooltip({
  content,
  children,
  placement = 'top',
  className,
}: TooltipProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 rounded-md border border-line bg-surface-overlay px-2 py-1 text-[11px] text-content-primary shadow-[var(--shadow-pop)]',
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
