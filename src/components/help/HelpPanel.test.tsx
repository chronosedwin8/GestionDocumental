import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { MarkdownView } from '@/components/ui/MarkdownView';
import { HelpPanel } from './HelpPanel';
import type { HelpArticle } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true }),
}));

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({ moduleLabel: (code: string | null) => code ?? '—' }),
}));

const listHelp = vi.fn();
vi.mock('@/api/help', () => ({
  listHelp: (...args: unknown[]) => listHelp(...args),
  getHelp: vi.fn(),
}));

/** Artículo hostil: HTML incrustado en el markdown que edita un administrador. */
const HOSTILE: HelpArticle = {
  id: 'a1',
  slug: 'foliacion',
  title: 'Foliación y radicación',
  body_md: [
    '# Foliación',
    '',
    'El folio se asigna al cargar el documento.',
    '',
    '<script>window.__eduarchive_pwned = true;</script>',
    '<img src="x" onerror="window.__eduarchive_pwned = true">',
    '',
    '[Enlace válido](https://example.org/manual)',
    '[Enlace peligroso](javascript:window.__eduarchive_pwned=true)',
  ].join('\n'),
  module_code: null,
  role_codes: null,
  sort_order: 1,
  updated_at: '2026-09-01T10:00:00.000Z',
};

describe('Ayuda contextual · saneamiento de markdown', () => {
  beforeEach(() => {
    clearQueryCache();
    listHelp.mockReset();
    delete (window as unknown as Record<string, unknown>).__eduarchive_pwned;
  });

  it('MarkdownView escapa el HTML del artículo en lugar de inyectarlo', () => {
    const { container } = render(<MarkdownView source={HOSTILE.body_md} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__eduarchive_pwned).toBeUndefined();
    // El texto peligroso se muestra como texto plano, no como marcado.
    expect(container.textContent).toContain('<script>');
  });

  it('solo admite enlaces http(s) o internos: descarta javascript:', () => {
    const { container } = render(<MarkdownView source={HOSTILE.body_md} />);

    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.org/manual');
    expect(container.textContent).toContain('javascript:');
  });

  it('renderiza el artículo que devuelve GET /help sin ejecutar su HTML', async () => {
    listHelp.mockResolvedValue([HOSTILE]);

    const { container } = render(
      <MemoryRouter>
        <HelpPanel open onClose={() => undefined} slug="foliacion" contextLabel="TRD" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Foliación y radicación' })).toBeInTheDocument();
    });

    expect(screen.getByText('El folio se asigna al cargar el documento.')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__eduarchive_pwned).toBeUndefined();
  });

  it('muestra un estado vacío honesto cuando el servidor no tiene artículos', async () => {
    listHelp.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HelpPanel open onClose={() => undefined} moduleCode="ACADEMIC" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Todavía no hay artículos de ayuda')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Ir a Administración' })).toBeInTheDocument();
  });

  it('pide a la API solo los artículos de la dependencia indicada', async () => {
    listHelp.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HelpPanel open onClose={() => undefined} moduleCode="ACADEMIC" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listHelp).toHaveBeenCalled());
    expect(listHelp.mock.calls[0]?.[0]).toEqual({ module: 'ACADEMIC' });
  });
});
