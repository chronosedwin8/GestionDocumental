/**
 * Diálogos imperativos: sustituyen a `alert`, `confirm` y `prompt` nativos.
 *
 *   const ok = await confirm({ title: 'Eliminar', tone: 'danger' });
 *   const reason = await promptText({ title: 'Motivo', label: 'Motivo' });
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptDialog } from '@/components/ui/PromptDialog';
import type { ConfirmOptions, PromptOptions } from '@/types/ui';

export interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resuelve con el texto escrito, o `null` si se cancela. */
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface PromptState extends PromptOptions {
  resolve: (value: string | null) => void;
}

export function DialogProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...options, resolve });
      }),
    [],
  );

  const promptText = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptState({ ...options, resolve });
      }),
    [],
  );

  const value = useMemo(() => ({ confirm, promptText }), [confirm, promptText]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {confirmState && (
        <ConfirmDialog
          open
          {...confirmState}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        />
      )}
      {promptState && (
        <PromptDialog
          open
          {...promptState}
          onSubmit={(text) => {
            promptState.resolve(text);
            setPromptState(null);
          }}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs debe usarse dentro de <DialogProvider>.');
  return ctx;
}
