import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: 'right' | 'left';
  width?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/** Panel lateral accesible: Esc, foco atrapado y devolución del foco (U8). */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  width = 'w-full max-w-md',
  footer,
  children,
}: DrawerProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
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
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[data-autofocus]') ??
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
    <div className="fixed inset-0 z-[95]" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex flex-col border-line bg-surface-raised shadow-[var(--shadow-pop)]',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          width,
        )}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-content-primary"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-overlay hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
