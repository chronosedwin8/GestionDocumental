/**
 * Fortaleza de contraseña medida contra la política **real** del servidor
 * (`GET /system/password-policy`), no contra una regla inventada en el
 * cliente. Sin política publicada no se puntúa: se dice que no se conoce.
 */

import type { PasswordPolicy } from '@/types/api';

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordStrength {
  /** Reglas exigidas por la política, con su cumplimiento. */
  rules: PasswordRule[];
  /** Reglas cumplidas / reglas exigidas, de 0 a 1. */
  score: number;
  /** Cumple **todas** las reglas de la política. */
  valid: boolean;
  label: 'Vacía' | 'Débil' | 'Aceptable' | 'Fuerte';
}

const SYMBOL = /[^A-Za-z0-9]/;

/** Construye las reglas que la política declara; ni una más. */
export function evaluatePassword(password: string, policy: PasswordPolicy): PasswordStrength {
  const rules: PasswordRule[] = [
    {
      id: 'min_length',
      label: `Al menos ${policy.min_length} caracteres`,
      met: password.length >= policy.min_length,
    },
  ];

  if (policy.require_upper) {
    rules.push({ id: 'upper', label: 'Una letra mayúscula', met: /[A-ZÁÉÍÓÚÑ]/.test(password) });
  }
  if (policy.require_lower) {
    rules.push({ id: 'lower', label: 'Una letra minúscula', met: /[a-záéíóúñ]/.test(password) });
  }
  if (policy.require_digit) {
    rules.push({ id: 'digit', label: 'Un número', met: /\d/.test(password) });
  }
  if (policy.require_symbol) {
    rules.push({ id: 'symbol', label: 'Un símbolo', met: SYMBOL.test(password) });
  }

  const met = rules.filter((rule) => rule.met).length;
  const score = rules.length === 0 ? 0 : met / rules.length;
  const valid = met === rules.length && password.length > 0;

  let label: PasswordStrength['label'];
  if (password.length === 0) label = 'Vacía';
  else if (!valid) label = score >= 0.6 ? 'Aceptable' : 'Débil';
  else label = password.length >= policy.min_length + 4 ? 'Fuerte' : 'Aceptable';

  return { rules, score, valid, label };
}

/** Estado de la contraseña de un usuario según las fechas que publica la API. */
export type PasswordState = 'TEMPORAL' | 'VENCIDA' | 'POR_VENCER' | 'VIGENTE' | 'DESCONOCIDO';

export interface PasswordStatus {
  state: PasswordState;
  label: string;
  /** Días hasta el vencimiento; negativo si ya venció. */
  daysLeft: number | null;
}

/** Ventana de aviso para "por vencer", igual que el resto de semáforos. */
export const PASSWORD_WARN_DAYS = 7;

export function passwordStatus(user: {
  must_change_password: boolean;
  password_expires_at?: string | null;
}): PasswordStatus {
  if (user.must_change_password) {
    return { state: 'TEMPORAL', label: 'Temporal', daysLeft: null };
  }
  const expires = user.password_expires_at;
  if (!expires) {
    // `expiry_days` nulo en la política: la contraseña no vence.
    return { state: 'VIGENTE', label: 'Vigente', daysLeft: null };
  }
  const target = new Date(expires).getTime();
  if (Number.isNaN(target)) return { state: 'DESCONOCIDO', label: 'Sin dato', daysLeft: null };

  const daysLeft = Math.ceil((target - Date.now()) / 86_400_000);
  if (daysLeft < 0) return { state: 'VENCIDA', label: 'Vencida', daysLeft };
  if (daysLeft <= PASSWORD_WARN_DAYS) {
    return { state: 'POR_VENCER', label: `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`, daysLeft };
  }
  return { state: 'VIGENTE', label: 'Vigente', daysLeft };
}

/** Color de estado para insignias, tomado de los tokens del tema. */
export function passwordStatusColor(state: PasswordState): string {
  switch (state) {
    case 'TEMPORAL':
      return 'var(--color-info)';
    case 'VENCIDA':
      return 'var(--color-danger)';
    case 'POR_VENCER':
      return 'var(--color-warning)';
    case 'VIGENTE':
      return 'var(--color-success)';
    default:
      return 'var(--text-muted)';
  }
}
