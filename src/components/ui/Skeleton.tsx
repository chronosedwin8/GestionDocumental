import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden rounded-md bg-surface-overlay', className)}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }): React.JSX.Element {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando datos">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: cols }).map((__, colIndex) => (
            <Skeleton key={colIndex} className={cn('h-9 flex-1', colIndex === 0 && 'max-w-[40%]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-28" />
      ))}
    </div>
  );
}
