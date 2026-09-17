import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { CommandPalette } from './CommandPalette';
import type { GlobalSearchResult } from '@/types/api';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ canRead: () => true, isAdminArea: true }),
}));

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({
    activeModules: [
      {
        code: 'HUMAN_RESOURCES',
        name: 'Talento Humano',
        description: 'Historia Laboral y Contratación',
        icon: 'Briefcase',
        color: '#a855f7',
        s3_folder: 'talento-humano',
        folio_prefix: 'RRHH',
        radicado_prefix: 'TH',
        sort_order: 2,
        is_active: true,
      },
    ],
    moduleColor: () => '#a855f7',
    moduleLabel: (code: string) => (code === 'HUMAN_RESOURCES' ? 'Talento Humano' : code),
    personTypeLabel: (code: string) => (code === 'EMPLOYEE' ? 'Empleado' : code),
  }),
}));

const globalSearch = vi.fn();
vi.mock('@/api/search', () => ({
  global: (...args: unknown[]) => globalSearch(...args),
}));

/** Respuesta real de `GET /search/global?q=restrepo`. */
const RESULT: GlobalSearchResult = {
  documents: [
    {
      id: 'doc-1',
      title: 'Contrato laboral Ana Restrepo',
      type: 'Contrato Laboral',
      module_code: 'HUMAN_RESOURCES',
      folio_index: 'RRHH-2026-0001',
      s3_key: 'k',
      s3_bucket: 'b',
      file_name: 'contrato.pdf',
      file_type: 'application/pdf',
      file_size: 1024,
      sha256: null,
      page_count: null,
      status_code: 'ARCHIVO_GESTION',
      author_id: null,
      summary: null,
      ai_status: 'SKIPPED',
      category: null,
      subcategory: null,
      person_id: 'per-1',
      academic_period_id: null,
      retention_end_date: null,
      approved_by: null,
      approved_at: null,
      approval_sha256: null,
      deleted_at: null,
      delete_reason: null,
      permanent_delete_at: null,
      tags: [],
      metadata: [],
      created_at: '2026-09-17T23:20:50.511Z',
      updated_at: '2026-09-17T23:20:50.511Z',
    },
  ],
  expedientes: [
    {
      id: 'exp-1',
      radicado: 'TH-2026-0001',
      titulo: 'Historia laboral — Ana Restrepo',
      descripcion: null,
      module_code: 'HUMAN_RESOURCES',
      estado: 'ABIERTO',
      fecha_apertura: '2026-09-17T05:00:00.000Z',
      fecha_cierre: null,
      responsable_id: null,
      serie: 'Historia Laboral',
      subserie: null,
      person_id: 'per-1',
      academic_period_id: null,
      is_correspondence: false,
      correspondence_type_code: null,
      sender: null,
      recipient: null,
      response_due_at: null,
      responded_at: null,
      document_count: 1,
      created_by: null,
      created_at: '2026-09-17T23:20:50.532Z',
      updated_at: '2026-09-17T23:20:50.532Z',
    },
  ],
  people: [
    {
      id: 'per-1',
      type_code: 'EMPLOYEE',
      document_number: 'F4-PROBE-001',
      first_name: 'Ana',
      last_name: 'Restrepo',
      full_name: 'Ana Restrepo',
      status: 'ACTIVE',
    },
  ],
};

function renderPalette(open = true) {
  return render(
    <MemoryRouter>
      <CommandPalette open={open} onClose={() => undefined} />
    </MemoryRouter>,
  );
}

describe('Paleta de comandos (Ctrl+K)', () => {
  beforeEach(() => {
    clearQueryCache();
    navigate.mockReset();
    globalSearch.mockReset();
    globalSearch.mockResolvedValue(RESULT);
  });

  it('no consulta al servidor con menos de dos caracteres', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'a');
    // Se deja pasar el debounce dentro de act() para no dejar timers sueltos.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(globalSearch).not.toHaveBeenCalled();
    expect(screen.getByText(/Escribe al menos 2 caracteres/)).toBeInTheDocument();
  });

  it('agrupa los resultados del servidor en documentos, expedientes y personas', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'restrepo');

    await waitFor(() => expect(globalSearch).toHaveBeenCalled());
    expect(globalSearch.mock.calls[0]?.[0]).toBe('restrepo');

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.getByText('Documentos')).toBeInTheDocument();
    expect(screen.getByText('Expedientes')).toBeInTheDocument();
    expect(screen.getByText('Personas')).toBeInTheDocument();
    expect(screen.getByText('Contrato laboral Ana Restrepo')).toBeInTheDocument();
    expect(screen.getByText('Ana Restrepo')).toBeInTheDocument();
  });

  it('filtra también las dependencias del catálogo sin llamar al servidor', async () => {
    const user = userEvent.setup();
    globalSearch.mockResolvedValue({ documents: [], expedientes: [], people: [] });
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'talento');

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.getByText('Dependencias')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Talento Humano/ })).toBeInTheDocument();
  });

  it('navega con las flechas y abre con Enter el elemento activo', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'restrepo');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/personas/per-1');
  });

  it('ArrowUp desde el primer elemento salta al último (navegación circular)', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'restrepo');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/personas/per-1');
  });

  it('ofrece la búsqueda avanzada cuando no hay coincidencias', async () => {
    const user = userEvent.setup();
    globalSearch.mockResolvedValue({ documents: [], expedientes: [], people: [] });
    renderPalette();

    await user.type(screen.getByRole('combobox'), 'zzzz');

    await waitFor(() => expect(screen.getByText('Sin coincidencias')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Abrir búsqueda avanzada' })).toHaveAttribute(
      'href',
      '/buscar?modo=avanzada',
    );
  });
});
