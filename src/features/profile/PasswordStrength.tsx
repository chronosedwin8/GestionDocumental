import { Check, Info, X } from 'lucide-react';
import { evaluatePassword } from '@/lib/password';
import type { PasswordPolicy } from '@/types/api';

export interface PasswordStrengthProps {
  password: string;
  /** Política publicada por el servidor. `null` mientras no se conozca. */
  policy: PasswordPolicy | null;
  /** Motivo por el que no se pudo leer la política, si lo hay. */
  policyError?: string | null;
}

const BAR_COLOR = ['var(--color-danger)', 'var(--color-warning)', 'var(--color-success)'];

/**
 * Indicador de fortaleza medido contra la política real del servidor
 * (`GET /system/password-policy`). Sin política no se puntúa nada: inventar
 * reglas en el cliente daría una seguridad falsa y contradiría al servidor,
 * que es quien valida y quien rechaza con 422 `PASSWORD_REUSED`.
 */
export function PasswordStrength({
  password,
  policy,
  policyError,
}: PasswordStrengthProps): React.JSX.Element {
  if (!policy) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-sunken p-3 text-[11px] text-content-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>
          No se pudo leer la política de contraseñas del servidor
          {policyError ? `: ${policyError}` : '.'} No se muestra ninguna medida de fortaleza para no
          inventar reglas; el servidor validará la contraseña al guardarla.
        </span>
      </div>
    );
  }

  const strength = evaluatePassword(password, policy);
  const level = strength.valid ? 2 : strength.score >= 0.6 ? 1 : 0;

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-content-muted">Fortaleza según la política del servidor</span>
        <span className="font-medium text-content-primary" data-testid="password-strength-label">
          {strength.label}
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-overlay"
        role="progressbar"
        aria-label="Fortaleza de la contraseña"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(strength.score * 100)}
        aria-valuetext={strength.label}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round(strength.score * 100)}%`,
            backgroundColor: BAR_COLOR[level],
          }}
        />
      </div>

      <ul className="space-y-1">
        {strength.rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-1.5 text-[11px]">
            {rule.met ? (
              <Check className="h-3 w-3 text-state-success" aria-hidden />
            ) : (
              <X className="h-3 w-3 text-content-muted" aria-hidden />
            )}
            <span className={rule.met ? 'text-content-secondary' : 'text-content-muted'}>
              {rule.label}
            </span>
            <span className="sr-only">{rule.met ? '(cumplida)' : '(pendiente)'}</span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-content-muted">
        El servidor rechaza además las últimas {policy.history_count} contraseñas usadas
        {policy.expiry_days !== null ? ` y caduca cada ${policy.expiry_days} días` : ''}.
      </p>
    </div>
  );
}
