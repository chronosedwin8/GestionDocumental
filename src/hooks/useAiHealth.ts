import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import * as aiApi from '@/api/ai';
import type { AiHealth } from '@/types/api';
import type { QueryResult } from '@/hooks/useQuery';

/**
 * Estado del subsistema de IA (`GET /ai/health`). Solo se consulta si el
 * catálogo dice que la IA está habilitada; así un servidor sin clave no
 * provoca un 503 en cada pantalla.
 */
export function useAiHealth(enabled = true): QueryResult<AiHealth> {
  const { settings } = useCatalogs();
  return useQuery<AiHealth>('ai:health', (signal) => aiApi.health(signal), {
    enabled: enabled && settings?.ai_enabled !== false,
    staleTime: 60_000,
  });
}

/**
 * Umbral de confianza con el que se marca una sugerencia como incierta.
 *
 * Orden de lectura: `settings` del catálogo → `GET /ai/health`. Si el servidor
 * no publica ninguno se devuelve `null` y la interfaz **no** califica las
 * sugerencias: no hay umbral escrito en el cliente.
 */
export function useAiConfidenceThreshold(): number | null {
  const { settings } = useCatalogs();
  const health = useAiHealth();

  const fromSettings = settings?.ai_confidence_threshold;
  if (typeof fromSettings === 'number') return fromSettings;

  const fromHealth = health.data?.confidence_threshold;
  return typeof fromHealth === 'number' ? fromHealth : null;
}
