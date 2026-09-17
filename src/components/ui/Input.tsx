import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  invalid?: boolean;
}

export const inputClasses =
  'w-full rounded-lg border border-line bg-surface-overlay px-3 py-2 text-sm text-content-primary ' +
  'placeholder:text-content-disabled transition-colors focus:border-acid focus:outline-none ' +
  'focus-visible:outline-none disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, invalid, className, ...rest },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        inputClasses,
        icon ? 'pl-9' : undefined,
        invalid && 'border-state-danger focus:border-state-danger',
        className,
      )}
      {...rest}
    />
  );

  if (!icon) return field;

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" aria-hidden>
        {icon}
      </span>
      {field}
    </div>
  );
});
