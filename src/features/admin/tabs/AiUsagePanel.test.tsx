import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { clearQueryCache } from '@/hooks/useQuery';
import { AiUsagePanel, resolveTotals } from './AiUsagePanel';
import type { AiUsageResult } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

vi.mock('@/api/ai', () => ({
  usage: vi.fn(),
}));

import * as aiApi from '@/api/ai';

const USAGE: AiUsageResult = {
  rows: [
    { operation: 'ANALYZE', calls: 120, input_tokens: 240_000, output_tokens: 18_000, cached_hits: 30 },
    { operation: 'OCR', calls: 8, input_tokens: 64_000, output_tokens: 12_000, cached_hits: 0 },
  ],
  totals: { calls: 128, input_tokens: 304_000, output_tokens: 30_000, cached_hits: 30 },
  period: { from: '2026-08-18', to: '2026-09-17' },
};

describe('AiUsagePanel · consumo de IA', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(aiApi.usage).mockReset();
  });

  it('pinta una fila por operación con sus llamadas y tokens', async () => {
    vi.mocked(aiApi.usage).mockResolvedValue(USAGE);

    render(
      <MemoryRouter>
        <AiUsagePanel />
      </MemoryRouter>,
    );

    const row = (await screen.findByText('Resumen y etiquetas')).closest('tr') as HTMLElement;
    expect(within(row).getByText('120')).toBeInTheDocument();
    expect(within(row).getByText('240.000')).toBeInTheDocument();
    expect(within(row).getByText('18.000')).toBeInTheDocument();

    expect(screen.getByText('Reconocimiento óptico')).toBeInTheDocument();
    expect(screen.getByText(/Periodo informado por el servidor: 2026-08-18 → 2026-09-17/))
      .toBeInTheDocument();
  });

  it('suma los totales cuando el servidor no los envía', () => {
    const totals = resolveTotals(USAGE.rows, {});
    expect(totals).toEqual({
      calls: 128,
      input_tokens: 304_000,
      output_tokens: 30_000,
      cached_hits: 30,
    });
  });

  it('consulta de nuevo al cambiar el periodo', async () => {
    const user = userEvent.setup();
    vi.mocked(aiApi.usage).mockResolvedValue(USAGE);

    render(
      <MemoryRouter>
        <AiUsagePanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(aiApi.usage).toHaveBeenCalledTimes(1));
    const firstRange = vi.mocked(aiApi.usage).mock.calls[0]?.[0];

    await user.click(screen.getByRole('button', { name: '7 días' }));

    await waitFor(() => expect(aiApi.usage).toHaveBeenCalledTimes(2));
    const secondRange = vi.mocked(aiApi.usage).mock.calls[1]?.[0];
    expect(secondRange?.from).not.toEqual(firstRange?.from);
  });

  it('declara el periodo vacío en vez de inventar consumo', async () => {
    vi.mocked(aiApi.usage).mockResolvedValue({
      rows: [],
      totals: {},
      period: { from: '2026-09-10', to: '2026-09-17' },
    });

    render(
      <MemoryRouter>
        <AiUsagePanel />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No hay consumo de IA registrado en este periodo.'))
      .toBeInTheDocument();
  });

  it('muestra un estado honesto si la IA no está configurada', async () => {
    vi.mocked(aiApi.usage).mockRejectedValue(
      new ApiError('AI_NOT_CONFIGURED', 'La IA no está configurada.', 503),
    );

    render(
      <MemoryRouter>
        <AiUsagePanel />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Asistente de IA no disponible')).toBeInTheDocument();
    // Como es una persona con acceso a Administración, se ofrece el enlace.
    expect(screen.getByRole('link', { name: 'Ir a Administración' })).toBeInTheDocument();
  });
});
