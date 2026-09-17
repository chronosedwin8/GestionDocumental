import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Acción principal sugerida (U7 del plan). */
  action?: { label: string; onClick?: () => void; to?: string };
  tone?: 'default' | 'warning' | 'danger';
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
  className,
  children,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed px-6 py-12 text-center',
        tone === 'warning' && 'border-state-warning/40 bg-state-warning/5',
        tone === 'danger' && 'border-state-danger/40 bg-state-danger/5',
        tone === 'default' && 'border-line bg-surface-raised/50',
        className,
      )}
    >
      {icon && <div className="text-content-muted">{icon}</div>}
      <h3 className="font-display text-base text-content-primary">{title}</h3>
      {description && <p className="max-w-md text-sm text-content-muted">{description}</p>}
      {children}
      {action &&
        (action.to ? (
          <Link
            to={action.to}
            onClick={action.onClick}
            className="inline-flex items-center justify-center rounded-lg border border-transparent bg-acid px-3.5 py-2 text-sm font-semibold text-[color:var(--color-acid-fg)] no-underline transition-colors hover:bg-acid-hover hover:no-underline"
          >
            {action.label}
          </Link>
        ) : (
          <Button variant="primary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
