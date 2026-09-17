import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = 'Cargando' }: SpinnerProps): React.JSX.Element {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <Loader2 className={cn('h-4 w-4 animate-spin text-acid', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'Cargando' }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-10 w-10 animate-spin text-acid" aria-hidden />
      <p className="text-sm text-content-muted" role="status">
        {label}
      </p>
    </div>
  );
}
