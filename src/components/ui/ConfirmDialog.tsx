import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import type { ConfirmOptions } from '@/types/ui';

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Sustituye al diálogo nativo de confirmación del navegador. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      dismissable={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === 'danger' && (
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-state-danger" aria-hidden />
        )}
        <div className="text-sm text-content-secondary">{message ?? '¿Deseas continuar?'}</div>
      </div>
    </Dialog>
  );
}
