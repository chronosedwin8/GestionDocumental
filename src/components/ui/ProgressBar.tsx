import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  /** 0-100. El valor es real: lo reporta XHR, nunca se simula. */
  value: number;
  label?: string;
  tone?: 'default' | 'success' | 'danger';
  className?: string;
  showValue?: boolean;
}

export function ProgressBar({
  value,
  label,
  tone = 'default',
  className,
  showValue = false,
}: ProgressBarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progreso'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-200',
            tone === 'default' && 'bg-acid',
            tone === 'success' && 'bg-state-success',
            tone === 'danger' && 'bg-state-danger',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && <p className="mt-1 text-right font-mono text-[10px] text-content-muted">{clamped}%</p>}
    </div>
  );
}
