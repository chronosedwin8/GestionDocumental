import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Resuelve variables CSS del tema (`--color-acid`…) a su color real.
 *
 * Las gráficas de recharts pintan con atributos SVG, donde `var(--x)` no se
 * sustituye de forma fiable: aquí se lee el valor calculado y se vuelve a leer
 * cuando cambia el tema, de modo que los colores siguen saliendo de
 * `tokens.css` y no están escritos en el componente.
 */
export function useTokenColors(tokens: string[]): string[] {
  const { theme } = useTheme();
  const key = tokens.join('|');
  const [colors, setColors] = useState<string[]>(() => tokens.map(() => ''));

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setColors(key.split('|').map((token) => styles.getPropertyValue(token).trim()));
  }, [key, theme]);

  return colors;
}
