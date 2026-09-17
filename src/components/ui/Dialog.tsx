import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[min(1600px,96vw)] h-[92vh]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  /** Pie de diálogo (botones). */
  footer?: ReactNode;
  /** Evita cerrar al hacer clic fuera o pulsar Esc (procesos en curso). */
  dismissable?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * Diálogo accesible: `role="dialog"`, `aria-modal`, foco atrapado, cierre con
 * Esc y devolución del foco al elemento que lo abrió.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissable = true,
  className,
  bodyClassName,
  children,
}: DialogProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      // Se descartan los elementos ocultos de forma declarativa. No se usa
      // `offsetParent` porque falla con `position: fixed` (y en jsdom).
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true' &&
          el.closest('[hidden]') === null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissable, onClose],
  );

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ??
        panel?.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-card border border-line bg-surface-raised shadow-[var(--shadow-pop)] animate-slide-up',
          SIZES[size],
          size !== 'full' && 'max-h-[90vh]',
          className,
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate font-display text-base font-semibold text-content-primary">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs text-content-muted">
                {description}
              </p>
            )}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar diálogo"
              className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-overlay hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </header>

        <div className={cn('flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
