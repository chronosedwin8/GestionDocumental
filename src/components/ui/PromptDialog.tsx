import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { FormField } from './FormField';
import { Input } from './Input';
import { Textarea } from './Textarea';
import type { PromptOptions } from '@/types/ui';

export interface PromptDialogProps extends PromptOptions {
  open: boolean;
  loading?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Sustituye a `window.prompt`. Por defecto el valor es obligatorio: las
 * acciones destructivas del SGDEA exigen motivo (papelera, eliminación…).
 */
export function PromptDialog({
  open,
  title,
  message,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  required = true,
  multiline = true,
  minLength = 3,
  tone = 'default',
  loading = false,
  onSubmit,
  onCancel,
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTouched(false);
    }
  }, [open, initialValue]);

  const trimmed = value.trim();
  const error =
    required && touched && trimmed.length < minLength
      ? `Escribe al menos ${minLength} caracteres.`
      : null;
  const canSubmit = !required || trimmed.length >= minLength;

  const submit = (): void => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={typeof message === 'string' ? message : undefined}
      size="sm"
      dismissable={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={submit}
            loading={loading}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && typeof message !== 'string' && (
        <div className="mb-3 text-sm text-content-secondary">{message}</div>
      )}
      <FormField label={label} required={required} error={error}>
        {multiline ? (
          <Textarea
            data-autofocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
          />
        ) : (
          <Input
            data-autofocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
        )}
      </FormField>
    </Dialog>
  );
}
