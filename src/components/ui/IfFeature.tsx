import type { ReactNode } from 'react';
import { useFeatures } from '@/hooks/useFeature';

export interface IfFeatureProps {
  /** Código del catálogo (`docs/PERMISOS_Y_USUARIOS.md §3`). */
  code?: string;
  /** Varios códigos a la vez. */
  codes?: string[];
  /** `every` (por defecto) exige todas; `some` basta con una. */
  mode?: 'every' | 'some';
  /** Qué mostrar cuando la característica está deshabilitada. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Oculta una acción cuando el rol no tiene la característica.
 *
 * No sustituye a la comprobación del servidor: si alguien llega igualmente a
 * la ruta, la API responde 403 `FEATURE_DISABLED` y la interfaz muestra ese
 * mensaje. Esto solo evita ofrecer botones que van a fallar.
 */
export function IfFeature({
  code,
  codes,
  mode = 'every',
  fallback = null,
  children,
}: IfFeatureProps): React.JSX.Element {
  const list = codes ?? (code ? [code] : []);
  const allowed = useFeatures(list, mode);
  return <>{allowed ? children : fallback}</>;
}
