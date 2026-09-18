import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AiClassificationPanel } from './AiClassificationPanel';
import type { AiClassification } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: false }),
}));

vi.mock('@/api/ai', () => ({
  classify: vi.fn(),
}));

import * as aiApi from '@/api/ai';

const CLASSIFICATION: AiClassification = {
  document_type: [
    { value: 'Contrato de Prestación de Servicios', confidence: 0.9, reason: 'Incluye objeto y plazo.' },
  ],
  serie: [{ value: 'Contratación', confidence: 0.85, reason: 'Serie de contratación del módulo.' }],
  subserie: [{ value: 'Contratos de servicios', confidence: 0.7, reason: 'Subserie de contratos.' }],
  module_code: null,
};

const TYPES = ['Contrato de Prestación de Servicios', 'Acta'];
const SERIES = ['Contratación'];
const SUBSERIES = ['Contratos de servicios'];

function renderPanel(
  value = { type: '', category: '', subcategory: '' },
): { onAccept: ReturnType<typeof vi.fn> } {
  const onAccept = vi.fn();
  const file = new File(['objeto del contrato: mantenimiento'], 'contrato-2026.txt', {
    type: 'text/plain',
  });

  render(
    <MemoryRouter>
      <AiClassificationPanel
        moduleCode="ADMINISTRATIVE"
        file={file}
        value={value}
        typeValues={TYPES}
        serieValues={SERIES}
        subserieValues={SUBSERIES}
        threshold={0.6}
        onAccept={onAccept}
      />
    </MemoryRouter>,
  );
  return { onAccept };
}

describe('AiClassificationPanel · asistente de carga', () => {
  beforeEach(() => {
    vi.mocked(aiApi.classify).mockReset();
  });

  it('no llama a la IA hasta que alguien lo pide', () => {
    renderPanel();
    expect(aiApi.classify).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Sugerir con IA/ })).toBeInTheDocument();
  });

  it('envía módulo, nombre y muestra del texto, y no rellena ningún campo solo', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.classify).mockResolvedValue(CLASSIFICATION);

    const { onAccept } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Sugerir con IA/ }));

    await waitFor(() =>
      expect(aiApi.classify).toHaveBeenCalledWith({
        module_code: 'ADMINISTRATIVE',
        file_name: 'contrato-2026.txt',
        text: 'objeto del contrato: mantenimiento',
      }),
    );

    expect(await screen.findByText('Contrato de Prestación de Servicios')).toBeInTheDocument();
    // La IA propuso, pero nada se aplicó al formulario.
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getAllByText('Sin confirmar')).toHaveLength(3);
  });

  it('aplica la candidata al campo correcto con un clic', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.classify).mockResolvedValue(CLASSIFICATION);

    const { onAccept } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Sugerir con IA/ }));
    await user.click(await screen.findByRole('button', { name: /Usar «Contratación» como Serie/ }));

    expect(onAccept).toHaveBeenCalledWith('category', 'Contratación');
  });

  it('permite ignorar todas las sugerencias y clasificar a mano', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.classify).mockResolvedValue(CLASSIFICATION);

    renderPanel();
    await user.click(screen.getByRole('button', { name: /Sugerir con IA/ }));
    await user.click(await screen.findByRole('button', { name: 'Ignorar sugerencias' }));

    expect(screen.queryByText('Contrato de Prestación de Servicios')).not.toBeInTheDocument();
    expect(screen.getByText(/Sugerencias descartadas/)).toBeInTheDocument();
  });

  it('no pide sugerencia para formatos que el navegador no puede leer', () => {
    // El servidor exige una muestra de texto (`text` de 20 caracteres mínimo)
    // en la forma previa a guardar: para un PDF escaneado no hay nada que
    // mandar, así que no se ofrece el botón ni se lanza una petición fallida.
    render(
      <MemoryRouter>
        <AiClassificationPanel
          moduleCode="ADMINISTRATIVE"
          file={new File(['%PDF-1.7'], 'escaneo.pdf', { type: 'application/pdf' })}
          value={{ type: '', category: '', subcategory: '' }}
          typeValues={TYPES}
          serieValues={SERIES}
          subserieValues={SUBSERIES}
          threshold={0.6}
          onAccept={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /Sugerir con IA/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Este formato no se puede leer en el navegador/)).toBeInTheDocument();
    expect(aiApi.classify).not.toHaveBeenCalled();
  });
});
