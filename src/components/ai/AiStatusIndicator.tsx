import { AlertTriangle, Clock, MinusCircle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { AiStatus } from '@/types/api';

export interface AiStatusIndicatorProps {
  status: AiStatus;
  /** `documents.ai_error`: el motivo real del fallo, nunca uno inventado. */
  error?: string | null;
  /** Reintento del análisis. Solo se ofrece si hay permiso de escritura. */
  onRetry?: () => void;
  retrying?: boolean;
  /** `inline` para la tabla (discreto), `block` para el visor. */
  variant?: 'inline' | 'block';
}

interface StatusMeta {
  label: string;
  /** Color del tema, aplicado en línea igual que los colores de catálogo. */
  color: string;
  /** Clases del panel en la variante `block`. */
  panel: string;
  description: string;
  icon: React.ReactNode;
}

const META: Record<Exclude<AiStatus, 'DONE'>, StatusMeta> = {
  PENDING: {
    label: 'IA en cola',
    color: 'var(--color-warning)',
    panel: 'border-state-warning/40 bg-state-warning/10 text-state-warning',
    description: 'El análisis automático todavía no se ha ejecutado.',
    icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
  },
  FAILED: {
    label: 'IA fallida',
    color: 'var(--color-danger)',
    panel: 'border-state-danger/40 bg-state-danger/10 text-state-danger',
    description: 'El análisis automático falló.',
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  },
  SKIPPED: {
    label: 'IA omitida',
    color: 'var(--text-muted)',
    panel: 'border-line bg-surface-overlay text-content-muted',
    description: 'El análisis se omitió: el documento no tenía texto suficiente.',
    icon: <MinusCircle className="h-3.5 w-3.5" aria-hidden />,
  },
};

/**
 * Indicador discreto de `ai_status`. No pinta nada cuando el análisis terminó
 * bien: solo interesan pendiente, fallido y omitido (punto 4 del encargo).
 */
export function AiStatusIndicator({
  status,
  error,
  onRetry,
  retrying = false,
  variant = 'inline',
}: AiStatusIndicatorProps): React.JSX.Element | null {
  if (status === 'DONE') return null;
  const meta = META[status];
  const detail = error?.trim() ? error.trim() : meta.description;

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1">
        <Tooltip content={detail}>
          <Badge color={meta.color} title={detail}>
            {meta.icon}
            {meta.label}
          </Badge>
        </Tooltip>
        {onRetry && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Reintentar el análisis de IA"
            loading={retrying}
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          />
        )}
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${meta.panel}`}>
      <span className="mt-0.5 flex-shrink-0">{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{meta.label}</p>
        <p className="mt-0.5 break-words text-content-secondary">{detail}</p>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          loading={retrying}
          onClick={onRetry}
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        >
          Reintentar
        </Button>
      )}
    </div>
  );
}
