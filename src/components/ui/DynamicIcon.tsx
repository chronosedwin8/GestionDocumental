/**
 * Resuelve un icono de lucide por su nombre, tal como llega del catálogo
 * (`modules.icon`, `notification_types.icon`). Sin listas fijas en el cliente.
 */

import { memo } from 'react';
import * as Lucide from 'lucide-react';
import type { LucideProps } from 'lucide-react';

type IconComponent = React.ComponentType<LucideProps>;

const registry = Lucide as unknown as Record<string, IconComponent | undefined>;

/** `file-text`, `fileText` y `FileText` resuelven al mismo icono. */
function toPascalCase(name: string): string {
  return name
    .replace(/[_\s]+/g, '-')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function resolveIcon(name: string | null | undefined): IconComponent {
  if (name) {
    const direct = registry[name];
    if (typeof direct === 'function') return direct;
    const pascal = registry[toPascalCase(name)];
    if (typeof pascal === 'function') return pascal;
  }
  return Lucide.Folder;
}

export interface DynamicIconProps extends Omit<LucideProps, 'name'> {
  /** Nombre del icono tal como llega del catálogo. */
  name: string | null | undefined;
}

export const DynamicIcon = memo(function DynamicIcon({
  name,
  ...props
}: DynamicIconProps): React.JSX.Element {
  const Icon = resolveIcon(name);
  return <Icon aria-hidden {...props} />;
});
