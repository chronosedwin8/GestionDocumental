import { Check, CircleHelp, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatConfidence, isUncertain } from '@/lib/ai';
import type { AiSuggestion } from '@/types/api';

export interface AiSuggestionListProps {
  /** Campo al que pertenecen las candidatas ("Tipo documental", "Serie"…). */
  fieldLabel: string;
  suggestions: AiSuggestion[];
  /** Valor confirmado hoy en el formulario. Cadena vacía = sin confirmar. */
  value: string;
  onAccept: (value: string) => void;
  /** Umbral publicado por el servidor; `null` = no se califica la confianza. */
  threshold: number | null;
  /**
   * Valores que existen de verdad en el catálogo del servidor (TRD o series
   * del módulo). Una propuesta fuera de esta lista se muestra, pero no se
   * puede aceptar: cambiaría la clasificación a un valor inexistente.
   */
  knownValues: string[];
  disabled?: boolean;
}

/**
 * Candidatas de la IA para un campo de clasificación.
 *
 * Regla dura: **nunca** preselecciona. El campo del formulario sigue vacío
 * hasta que una persona pulsa "Usar"; hasta entonces la tarjeta se anuncia
 * como propuesta sin confirmar.
 */
export function AiSuggestionList({
  fieldLabel,
  suggestions,
  value,
  onAccept,
  threshold,
  knownValues,
  disabled = false,
}: AiSuggestionListProps): React.JSX.Element {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-raised px-3 py-2">
        <p className="text-[11px] font-medium text-content-secondary">{fieldLabel}</p>
        <p className="mt-1 text-xs text-content-muted">
          La IA no propuso ninguna candidata para este campo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2">
      <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-content-secondary">
        <span>{fieldLabel}</span>
        {value === '' ? (
          <span className="text-content-muted">Sin confirmar</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-state-success">
            <Check className="h-3 w-3" aria-hidden />
            Confirmado: {value}
          </span>
        )}
      </p>

      <ul className="mt-2 space-y-2">
        {suggestions.map((suggestion) => {
          const known = knownValues.includes(suggestion.value);
          const accepted = value === suggestion.value;
          const uncertain = isUncertain(suggestion.confidence, threshold, suggestion.uncertain);
          const confidence = formatConfidence(suggestion.confidence);

          return (
            <li
              key={`${suggestion.value}-${suggestion.confidence}`}
              className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge color="var(--color-info)">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Sugerido por IA
                </Badge>
                <span className="min-w-0 break-words text-sm text-content-primary">
                  {suggestion.value}
                </span>
                {confidence && (
                  <Badge color={uncertain ? 'var(--color-warning)' : undefined}>
                    Confianza {confidence}
                  </Badge>
                )}
                {uncertain && (
                  <Badge color="var(--color-warning)">
                    <CircleHelp className="h-3 w-3" aria-hidden />
                    Incierta
                  </Badge>
                )}
                {!known && (
                  <Badge color="var(--color-danger)">No existe en el catálogo</Badge>
                )}
              </div>

              <p className="mt-1 break-words text-xs text-content-muted">{suggestion.reason}</p>

              <div className="mt-2">
                {accepted ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-state-success">
                    <Check className="h-3 w-3" aria-hidden />
                    Confirmado por una persona
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled || !known}
                    onClick={() => onAccept(suggestion.value)}
                    aria-label={`Usar «${suggestion.value}» como ${fieldLabel}${
                      confidence ? ` (confianza ${confidence})` : ''
                    }`}
                    className="inline-flex items-center gap-1 rounded-md border border-acid-border bg-acid-soft px-2 py-1 text-[11px] font-medium text-acid transition-colors hover:bg-acid-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Usar esta
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
