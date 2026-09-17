import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Person } from '@/types/api';

export interface CompletenessMeterProps {
  completeness: Person['completeness'];
  /** Etiqueta del expediente (hoja de vida / expediente académico). */
  fileLabel: string;
  compact?: boolean;
}

/** Color del semáforo: rojo sin nada, ámbar parcial, verde completo. */
function toneFor(present: number, required: number): string {
  if (required === 0) return 'var(--color-info)';
  if (present >= required) return 'var(--color-success)';
  if (present === 0) return 'var(--color-danger)';
  return 'var(--color-warning)';
}

/**
 * Semáforo de completitud documental (P6): usa `completeness` tal cual lo
 * calcula el servidor y enumera los documentos que faltan.
 */
export function CompletenessMeter({
  completeness,
  fileLabel,
  compact = false,
}: CompletenessMeterProps): React.JSX.Element {
  if (!completeness) {
    return (
      <p className="text-xs text-content-muted">
        El servidor no devolvió el cálculo de completitud para esta persona.
      </p>
    );
  }

  const { required, present, missing } = completeness;
  const percent = required === 0 ? 100 : Math.round((present / required) * 100);
  const tone = toneFor(present, required);

  if (required === 0) {
    return (
      <p className="text-xs text-content-muted">
        No hay documentos obligatorios configurados para este tipo de persona.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-secondary">
          {fileLabel}: {present} de {required} documentos obligatorios
        </p>
        <Badge color={tone}>{percent}%</Badge>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-surface-overlay"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={present}
        aria-label={`Completitud documental: ${present} de ${required}`}
      >
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: tone }} />
      </div>

      {!compact && (
        <ul className="space-y-1">
          {missing.length === 0 ? (
            <li className="flex items-center gap-2 text-xs text-state-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Expediente completo.
            </li>
          ) : (
            missing.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-content-secondary">
                <CircleDashed className="h-3.5 w-3.5 flex-shrink-0 text-state-warning" aria-hidden />
                Falta: {item}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
