import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { clearQueryCache } from '@/hooks/useQuery';
import { GeneralTab } from './GeneralTab';
import type { GeneralStats } from '@/types/api';

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({
    moduleLabel: (code: string) => (code === 'ACADEMIC' ? 'Gestión Académica' : code),
    statusLabel: (code: string) => (code === 'ARCHIVO_GESTION' ? 'Archivo de Gestión' : code),
    statusColor: () => 'var(--color-info)',
    dispositionLabel: (code: string) => (code === 'KEEP' ? 'Conservar' : code),
    dispositionColor: () => 'var(--color-success)',
  }),
}));

vi.mock('@/api/stats', () => ({ general: vi.fn() }));

import * as statsApi from '@/api/stats';

/**
 * Respuesta literal de `GET /stats/general` tal como la emite el servidor.
 *
 * Esta constante existe porque la interfaz asumió durante un tiempo que `kpis`
 * y `trd_compliance` eran arreglos, cuando el servidor siempre envió objetos
 * con campos nombrados: la pantalla de estadísticas se caía con
 * «data.kpis.map is not a function». La prueba fija la forma real.
 */
const RESPUESTA: GeneralStats = {
  kpis: {
    total_documents: 17,
    documents_this_month: 0,
    documents_this_year: 17,
    total_bytes: 15_380_363,
    with_trd: 3,
    with_folio: 15,
    total_expedientes: 3,
    open_expedientes: 2,
    active_loans: 0,
    overdue_loans: 3,
    trashed: 0,
    active_users: 2,
  },
  by_module: [
    { module_code: 'ACADEMIC', name: 'Gestión Académica', total: 6, alerts: 0, without_trd: 5 },
  ],
  by_status: [{ code: 'ARCHIVO_GESTION', total: 15 }],
  by_disposition: [{ code: 'KEEP', total: 3 }],
  trd_compliance: { total: 17, with_trd: 3, with_folio: 15 },
};

describe('GeneralTab', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(statsApi.general).mockResolvedValue(RESPUESTA);
  });

  it('pinta los indicadores desde el objeto con campos nombrados', async () => {
    render(<GeneralTab />);
    expect(await screen.findByText('Documentos totales')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Expedientes')).toBeInTheDocument();
  });

  it('calcula el cumplimiento sin dividir por cero', async () => {
    vi.mocked(statsApi.general).mockResolvedValue({
      ...RESPUESTA,
      trd_compliance: { total: 0, with_trd: 0, with_folio: 0 },
    });
    render(<GeneralTab />);
    expect(await screen.findByText('Todavía no hay documentos que evaluar.')).toBeInTheDocument();
  });

  it('muestra el porcentaje de retención aplicada', async () => {
    render(<GeneralTab />);
    // 3 de 17 documentos = 18 %
    expect(await screen.findByLabelText('Con tabla de retención aplicada')).toHaveAttribute(
      'aria-valuenow',
      '18',
    );
    expect(screen.getByLabelText('Con folio asignado')).toHaveAttribute('aria-valuenow', '88');
  });

  it('lista las dependencias y resalta las que no están clasificadas', async () => {
    render(<GeneralTab />);
    expect(await screen.findByText('Gestión Académica')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('traduce los estados y las disposiciones con el catálogo', async () => {
    render(<GeneralTab />);
    expect(await screen.findByText('Archivo de Gestión: 15')).toBeInTheDocument();
    expect(screen.getByText('Conservar: 3')).toBeInTheDocument();
  });
});
