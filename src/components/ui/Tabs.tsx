import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline';
  className?: string;
  ariaLabel?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'pill',
  className,
  ariaLabel = 'Secciones',
}: TabsProps): React.JSX.Element {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === value);
    if (index === -1) return;
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % enabled.length
        : (index - 1 + enabled.length) % enabled.length;
    event.preventDefault();
    onChange(enabled[nextIndex]!.id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-1 overflow-x-auto scrollbar-hide',
        variant === 'pill' && 'rounded-lg border border-line bg-surface-sunken p-1',
        variant === 'underline' && 'border-b border-line',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium transition-colors disabled:opacity-40',
              variant === 'pill' && 'rounded-md px-3 py-2',
              variant === 'pill' && active
                ? 'bg-acid-soft text-acid'
                : variant === 'pill'
                  ? 'text-content-muted hover:text-content-primary'
                  : '',
              variant === 'underline' && 'border-b-2 px-3 py-2.5 uppercase tracking-wide',
              variant === 'underline' && active
                ? 'border-acid text-acid'
                : variant === 'underline'
                  ? 'border-transparent text-content-muted hover:text-content-primary'
                  : '',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="rounded-full bg-state-danger px-1.5 text-[10px] font-bold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
  className,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}): React.JSX.Element | null {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className={className}>
      {children}
    </div>
  );
}
