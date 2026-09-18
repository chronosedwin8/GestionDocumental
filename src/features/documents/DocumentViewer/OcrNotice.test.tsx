import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { OcrNotice } from './OcrNotice';
import type { ApiDocument } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true }),
}));

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({ settings: { ai_enabled: true } }),
}));

vi.mock('@/api/documents', () => ({
  getDocumentText: vi.fn(),
}));

vi.mock('@/api/ai', () => ({
  ocr: vi.fn(),
}));

import * as aiApi from '@/api/ai';
import * as documentsApi from '@/api/documents';

const DOCUMENT = {
  id: 'doc-1',
  title: 'Acta escaneada 2019',
  file_name: 'acta-2019.pdf',
  file_type: 'application/pdf',
  ai_status: 'SKIPPED',
  metadata: [],
  tags: [],
} as unknown as ApiDocument;

function renderNotice(onRecognized = vi.fn()): { onRecognized: ReturnType<typeof vi.fn> } {
  render(
    <MemoryRouter>
      <OcrNotice document={DOCUMENT} canWrite onRecognized={onRecognized} />
    </MemoryRouter>,
  );
  return { onRecognized };
}

describe('OcrNotice · reconocimiento óptico', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(documentsApi.getDocumentText).mockReset();
    vi.mocked(aiApi.ocr).mockReset();
  });

  it('avisa, sin rodeos, cuando el documento no tiene texto reconocible', async () => {
    vi.mocked(documentsApi.getDocumentText).mockResolvedValue({ text: '', truncated: false });

    renderNotice();

    expect(await screen.findByText('Sin texto reconocible')).toBeInTheDocument();
    expect(
      screen.getByText(/no tiene texto reconocible, por eso no aparece en búsquedas por contenido/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconocer texto con IA' })).toBeInTheDocument();
  });

  it('no muestra nada cuando el documento sí tiene texto extraído', async () => {
    vi.mocked(documentsApi.getDocumentText).mockResolvedValue({
      text: 'Acta de la reunión del consejo directivo…',
      truncated: false,
    });

    renderNotice();

    await waitFor(() => expect(documentsApi.getDocumentText).toHaveBeenCalled());
    expect(screen.queryByText('Sin texto reconocible')).not.toBeInTheDocument();
  });

  it('ejecuta POST /ai/ocr y muestra caracteres y páginas reconocidas', async () => {
    const user = userEvent.setup();
    vi.mocked(documentsApi.getDocumentText).mockResolvedValue({ text: '', truncated: false });
    vi.mocked(aiApi.ocr).mockResolvedValue({ text_chars: 18_420, page_count: 12, pages_processed: 10 });

    const { onRecognized } = renderNotice();

    await user.click(await screen.findByRole('button', { name: 'Reconocer texto con IA' }));

    await waitFor(() => expect(aiApi.ocr).toHaveBeenCalledWith({ document_id: 'doc-1' }));
    expect(await screen.findByText(/18\.420 caracteres en 10 de 12 página\(s\)/)).toBeInTheDocument();
    // Al terminar se refresca el documento del visor.
    expect(onRecognized).toHaveBeenCalledTimes(1);
  });

  it('no ofrece el botón a quien no puede escribir en la dependencia', async () => {
    vi.mocked(documentsApi.getDocumentText).mockResolvedValue({ text: '', truncated: false });

    render(
      <MemoryRouter>
        <OcrNotice document={DOCUMENT} canWrite={false} onRecognized={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sin texto reconocible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconocer texto con IA' })).not.toBeInTheDocument();
    expect(screen.getByText(/Necesitas permiso de escritura/)).toBeInTheDocument();
  });
});
