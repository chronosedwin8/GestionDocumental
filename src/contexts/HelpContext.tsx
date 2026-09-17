/**
 * Ayuda contextual (U10). Cualquier pantalla pide su artículo con
 * `useHelp().openHelp({ slug, moduleCode })`; el panel se renderiza una sola
 * vez aquí y el contenido siempre llega de `GET /help`.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { HelpPanel, type HelpTarget } from '@/components/help/HelpPanel';

export interface HelpContextValue {
  openHelp: (target?: HelpTarget) => void;
  closeHelp: () => void;
  isOpen: boolean;
}

const HelpContext = createContext<HelpContextValue | undefined>(undefined);

export function HelpProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [target, setTarget] = useState<HelpTarget | null>(null);

  const openHelp = useCallback((next: HelpTarget = {}) => setTarget(next), []);
  const closeHelp = useCallback(() => setTarget(null), []);

  const value = useMemo<HelpContextValue>(
    () => ({ openHelp, closeHelp, isOpen: target !== null }),
    [openHelp, closeHelp, target],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpPanel open={target !== null} onClose={closeHelp} {...(target ?? {})} />
    </HelpContext.Provider>
  );
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp debe usarse dentro de <HelpProvider>.');
  return ctx;
}
