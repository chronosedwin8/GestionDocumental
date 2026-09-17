import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import { cn } from '@/lib/cn';

export interface FormFieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
}

/** Etiqueta + control + ayuda/error, con `id`/`aria-describedby` enlazados. */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps): React.JSX.Element {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const control = isValidElement(children)
    ? cloneElement(children, { id, ...(describedBy ? { 'aria-describedby': describedBy } : {}) })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-content-secondary">
        {label}
        {required && (
          <span className="ml-1 text-state-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-state-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-content-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
