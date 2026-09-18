import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SemanticResults } from './SemanticResults';
import type { ApiDocument, SemanticMatch } from '@/types/api';

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({
    moduleLabel: (code: string) => (code === 'ADMINISTRATIVE' ? 'Administrativa' : code),
    moduleColor: () => '#38bdf8',
    statusLabel: (code: string) => (code === 'ARCHIVO_GESTION' ? 'Archivo de gestión' : code),
    statusColor: () => '#34d399',
  }),
}));

vi.mock('@/hooks/useBookmarks', () => ({
  useBookmarks: () => ({ isBookmarked: () => false, toggle: vi.fn(), loading: false }),
}));

function doc(id: string, title: string): ApiDocument {
  return {
    id,
    title,
    type: 'Contrato',
    module_code: 'ADMINISTRATIVE',
    folio_index: '001',
    status_code: 'ARCHIVO_GESTION',
    file_name: `${id}.pdf`,
    file_type: 'application/pdf',
    file_size: 1024,
    ai_status: 'DONE',
    metadata: [],
    tags: [],
    created_at: '2026-05-02T10:00:00.000Z',
  } as unknown as ApiDocument;
}

const DOCUMENTS = [doc('doc-1', 'Contrato de mantenimiento 2026'), doc('doc-2', 'Acta de comité')];

const MATCHES: SemanticMatch[] = [
  {
    document_id: 'doc-1',
    reason: 'Describe el mantenimiento preventivo de las instalaciones durante 2026.',
    score: 0.92,
  },
];

describe('SemanticResults · motivos de la búsqueda semántica', () => {
  it('muestra el motivo y la puntuación bajo cada resultado con match', () => {
    render(
      <MemoryRouter>
        <SemanticResults documents={DOCUMENTS} matches={MATCHES} onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    const first = screen.getByText('Contrato de mantenimiento 2026').closest('li') as HTMLElement;
    expect(within(first).getByText('Por qué es relevante')).toBeInTheDocument();
    expect(
      within(first).getByText(
        'Describe el mantenimiento preventivo de las instalaciones durante 2026.',
      ),
    ).toBeInTheDocument();
    expect(within(first).getByText('Puntuación 92 %')).toBeInTheDocument();
  });

  it('dice que no hay motivo en lugar de inventarlo', () => {
    render(
      <MemoryRouter>
        <SemanticResults documents={DOCUMENTS} matches={MATCHES} onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    const second = screen.getByText('Acta de comité').closest('li') as HTMLElement;
    expect(within(second).getByText('El servidor no envió un motivo para este resultado.'))
      .toBeInTheDocument();
    expect(within(second).queryByText('Por qué es relevante')).not.toBeInTheDocument();
  });

  it('no inventa motivos cuando el servidor no envía `matches`', () => {
    render(
      <MemoryRouter>
        <SemanticResults documents={DOCUMENTS} matches={[]} onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Por qué es relevante')).not.toBeInTheDocument();
    expect(screen.getAllByText('El servidor no envió un motivo para este resultado.')).toHaveLength(2);
  });

  it('abre el documento al pulsar su título', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <MemoryRouter>
        <SemanticResults documents={DOCUMENTS} matches={MATCHES} onOpen={onOpen} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Contrato de mantenimiento 2026' }));
    expect(onOpen).toHaveBeenCalledWith(DOCUMENTS[0]);
  });
});
