import type { Config } from 'tailwindcss';

/**
 * Los colores se declaran como variables CSS en src/styles/tokens.css y aquí se
 * exponen como utilidades de Tailwind. Así el tema claro/oscuro funciona
 * cambiando `data-theme` sin duplicar clases.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      colors: {
        acid: {
          DEFAULT: 'var(--color-acid)',
          hover: 'var(--color-acid-hover)',
          soft: 'var(--color-acid-soft)',
          border: 'var(--color-acid-border)',
          fg: 'var(--color-acid-fg)',
        },
        surface: {
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          sunken: 'var(--surface-sunken)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
          inverted: 'var(--text-inverted)',
        },
        state: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-danger)',
          info: 'var(--color-info)',
        },
      },
      borderRadius: {
        card: '0.75rem',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn .18s ease-out both',
        'slide-up': 'slideUp .2s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
