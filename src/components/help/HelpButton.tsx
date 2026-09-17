import { HelpCircle } from 'lucide-react';
import { useHelp } from '@/contexts/HelpContext';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { HelpTarget } from './HelpPanel';

export interface HelpButtonProps extends HelpTarget {
  /** Etiqueta accesible del botón (la pantalla sabe de qué habla). */
  label?: string;
}

/** Botón "?" que abre la ayuda de la pantalla actual (U10). */
export function HelpButton({ label = 'Ayuda de esta pantalla', ...target }: HelpButtonProps): React.JSX.Element {
  const { openHelp } = useHelp();

  return (
    <Tooltip content={`${label} (Ctrl+/)`}>
      <Button
        size="icon"
        variant="outline"
        aria-label={label}
        onClick={() => openHelp(target)}
        icon={<HelpCircle className="h-4 w-4" />}
      />
    </Tooltip>
  );
}
