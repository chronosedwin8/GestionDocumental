import { useCallback, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

export interface MutationOptions<TInput, TResult> {
  onSuccess?: (result: TResult, input: TInput) => void | Promise<void>;
  onError?: (error: ApiError, input: TInput) => void;
}

export interface MutationResult<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult | undefined>;
  loading: boolean;
  error: ApiError | null;
  reset: () => void;
}

/** Ejecuta una acción del API controlando estado de carga y error tipado. */
export function useMutation<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  options: MutationOptions<TInput, TResult> = {},
): MutationResult<TInput, TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutate = useCallback(async (input: TInput): Promise<TResult | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const result = await actionRef.current(input);
      await optionsRef.current.onSuccess?.(result, input);
      return result;
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Error inesperado.', 0);
      setError(apiError);
      optionsRef.current.onError?.(apiError, input);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { mutate, loading, error, reset };
}
