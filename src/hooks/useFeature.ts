/**
 * Características por rol en la interfaz.
 *
 * **Ocultar no es proteger.** El servidor aplica `requireFeature(...)` y
 * responde 403 `FEATURE_DISABLED`; esto solo evita ofrecer una acción que
 * fallaría. Si el servidor todavía no publica `effective_features`, no se
 * oculta nada: una restricción inventada por el cliente es peor que ninguna.
 */

import { useAuth } from '@/contexts/AuthContext';

/** ¿El rol del usuario tiene habilitada esta característica? */
export function useFeature(code: string): boolean {
  const { hasFeature } = useAuth();
  return hasFeature(code);
}

/** Versión para varios códigos: `every` por defecto, `some` con `mode`. */
export function useFeatures(codes: string[], mode: 'every' | 'some' = 'every'): boolean {
  const { hasFeature } = useAuth();
  if (codes.length === 0) return true;
  return mode === 'every' ? codes.every(hasFeature) : codes.some(hasFeature);
}
