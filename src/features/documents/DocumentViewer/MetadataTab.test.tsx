import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { MetadataTab } from './MetadataTab';
import type { ApiDocument, DocumentMetadataEntry } from '@/types/api';

const confirmMock = vi.fn(async () => true);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true }),
}));

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({ settings: { ai_enabled: true, ai_confidence_threshold: 0.6 } }),
}));

vi.mock('@/contexts/DialogContext', () => ({
  useDialogs: () => ({ confirm: confirmMock, promptText: vi.fn() }),
}));

vi.mock('@/api/ai', () => ({
  extractMetadata: vi.fn(),
}));

// El umbral lo publica el servidor; aquí se fija el que devolvería /ai/health.
vi.mock('@/hooks/useAiHealth', () => ({
  useAiConfidenceThreshold: () => 0.6,
}));

vi.mock('@/api/documents', () => ({
  upsertMetadata: vi.fn(),
  deleteMetadata: vi.fn(),
}));

import * as aiApi from '@/api/ai';
import * as documentsApi from '@/api/documents';

/** Un metadato escrito por una persona y otro extraído por la IA. */
const METADATA: DocumentMetadataEntry[] = [
  { key: 'Número de contrato', value: 'CT-2026-114', is_extracted: false, confidence: null },
  { key: 'Valor', value: '$ 12.000.000', is_extracted: true, confidence: 0.88 },
];

const DOCUMENT = {
  id: 'doc-1',
  title: 'Contrato de mantenimiento',
  metadata: METADATA,
  tags: [],
  ai_status: 'DONE',
  module_code: 'ADMINISTRATIVE',
} as unknown as ApiDocument;

function renderTab(): { onUpdated: ReturnType<typeof vi.fn> } {
  const onUpdated = vi.fn();
  render(
    <MemoryRouter>
      <MetadataTab document={DOCUMENT} canWrite onUpdated={onUpdated} />
    </MemoryRouter>,
  );
  return { onUpdated };
}

describe('MetadataTab · metadatos extraídos frente a los humanos', () => {
  beforeEach(() => {
    clearQueryCache();
    confirmMock.mockClear();
    vi.mocked(aiApi.extractMetadata).mockReset();
    vi.mocked(documentsApi.upsertMetadata).mockReset();
  });

  it('distingue la procedencia de cada metadato ya guardado', () => {
    renderTab();

    expect(screen.getByText('Escrito por una persona')).toBeInTheDocument();
    expect(screen.getByText(/Extraído por IA\s*88%/)).toBeInTheDocument();
  });

  it('pide la extracción sin persistir y muestra los campos como propuesta', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.extractMetadata).mockResolvedValue({
      fields: [
        { key: 'Fecha de firma', value: '2026-03-14', confidence: 0.93 },
        { key: 'Contratista', value: 'Servicios Integrales SAS', confidence: 0.41 },
      ],
    });

    renderTab();
    await user.click(screen.getByRole('button', { name: 'Extraer metadatos con IA' }));

    await waitFor(() =>
      expect(aiApi.extractMetadata).toHaveBeenCalledWith({ document_id: 'doc-1', persist: false }),
    );

    expect(await screen.findByText('Propuestas sin guardar (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Propuesto por IA')).toHaveLength(2);
    expect(screen.getByText('Confianza 93 %')).toBeInTheDocument();
    // Por debajo del umbral publicado (0,6) se marca como incierta.
    expect(screen.getByText('Incierta')).toBeInTheDocument();
    // Nada se ha guardado todavía.
    expect(documentsApi.upsertMetadata).not.toHaveBeenCalled();
  });

  it('guarda una propuesta conservando que la escribió la IA y su confianza', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.extractMetadata).mockResolvedValue({
      fields: [{ key: 'Fecha de firma', value: '2026-03-14', confidence: 0.93 }],
    });
    vi.mocked(documentsApi.upsertMetadata).mockResolvedValue([
      ...METADATA,
      { key: 'Fecha de firma', value: '2026-03-14', is_extracted: true, confidence: 0.93 },
    ]);

    const { onUpdated } = renderTab();
    await user.click(screen.getByRole('button', { name: 'Extraer metadatos con IA' }));
    await user.click(await screen.findByRole('button', { name: 'Guardar este metadato' }));

    await waitFor(() =>
      expect(documentsApi.upsertMetadata).toHaveBeenCalledWith('doc-1', 'Fecha de firma', '2026-03-14', {
        is_extracted: true,
        confidence: 0.93,
      }),
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it('nunca pisa un valor humano en pantalla: muestra los dos y exige confirmación', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.extractMetadata).mockResolvedValue({
      fields: [{ key: 'Número de contrato', value: 'CT-2026-999', confidence: 0.77 }],
    });
    vi.mocked(documentsApi.upsertMetadata).mockResolvedValue(METADATA);

    renderTab();
    await user.click(screen.getByRole('button', { name: 'Extraer metadatos con IA' }));

    // El valor humano sigue visible en la lista y la propuesta aparece aparte.
    expect(await screen.findByText(/1 propuesta\(s\) chocan con un valor escrito por una persona/))
      .toBeInTheDocument();
    const proposal = (await screen.findByText('CT-2026-999')).closest('li') as HTMLElement;
    expect(within(proposal).getByText(/Valor actual \(escrito por una persona\): «CT-2026-114»/))
      .toBeInTheDocument();
    // El botón masivo no arrastra el conflicto.
    expect(screen.getByRole('button', { name: /Guardar 0 sin conflicto/ })).toBeDisabled();

    await user.click(within(proposal).getByRole('button', { name: 'Reemplazar el valor humano' }));
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('no guarda nada si se cancela el reemplazo del valor humano', async () => {
    const user = userEvent.setup();
    confirmMock.mockResolvedValueOnce(false);
    vi.mocked(aiApi.extractMetadata).mockResolvedValue({
      fields: [{ key: 'Número de contrato', value: 'CT-2026-999', confidence: 0.77 }],
    });

    renderTab();
    await user.click(screen.getByRole('button', { name: 'Extraer metadatos con IA' }));
    await user.click(await screen.findByRole('button', { name: 'Reemplazar el valor humano' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(documentsApi.upsertMetadata).not.toHaveBeenCalled();
  });
});
