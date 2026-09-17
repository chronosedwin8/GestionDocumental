import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

function normalize(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return parts.join('+');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export interface HotkeyOptions {
  enabled?: boolean;
  /** Permitir el atajo aunque el foco esté en un campo de texto. */
  allowInInputs?: boolean;
}

/**
 * Registra atajos de teclado. Las claves usan la forma `mod+k`, `Escape`,
 * `ArrowLeft`, `shift+e`… (`mod` = Ctrl en Windows, Cmd en macOS).
 */
export function useHotkeys(map: HotkeyMap, options: HotkeyOptions = {}): void {
  const { enabled = true, allowInInputs = false } = options;
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent): void => {
      if (!allowInInputs && isTypingTarget(event.target)) return;
      const combo = normalize(event);
      const handlerFn = mapRef.current[combo] ?? mapRef.current[event.key];
      if (handlerFn) {
        event.preventDefault();
        handlerFn(event);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, allowInInputs]);
}
