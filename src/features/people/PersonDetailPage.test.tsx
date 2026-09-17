import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import PersonDetailPage from './PersonDetailPage';
import type { ApiDocument, Expediente, Person, PersonEvent } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasFullAccess: true, canManageUsers: true, isAdminArea: true }),
}));

vi.mock('@/contexts/HelpContext', () => ({
  useHelp: () => ({ openHelp: vi.fn(), closeHelp: vi.fn(), isOpen: false }),
}));

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({
    personTypes: [
      { code: 'EMPLOYEE', name: 'Empleado' },
      { code: 'STUDENT', name: 'Estudiante' },
    ],
    personTypeLabel: (code: string | null) => (code === 'EMPLOYEE' ? 'Empleado' : (code ?? '—')),
    moduleLabel: (code: string | null) => (code === 'HUMAN_RESOURCES' ? 'Talento Humano' : (code ?? '—')),
    moduleColor: () => '#a855f7',
    statusLabel: (code: string | null) => (code === 'ARCHIVO_GESTION' ? 'Archivo de gestión' : (code ?? '—')),
    statusColor: () => '#34d399',
    // El servidor real no publica estos códigos en /catalogs; aquí se simula
    // que sí para comprobar la etiqueta "Hoja de vida".
    settings: { hr_module_code: 'HUMAN_RESOURCES', academic_module_code: 'ACADEMIC' },
  }),
}));

/** Respuestas reales del servidor para la persona de prueba. */
const PERSON: Person = {
  id: 'per-1',
  type_code: 'EMPLOYEE',
  document_number: 'F4-PROBE-001',
  first_name: 'Ana',
  last_name: 'Restrepo',
  full_name: 'Ana Restrepo',
  status: 'ACTIVE',
  email: 'ana.probe@example.org',
  phone: null,
  birth_date: null,
  hire_date: '2026-02-01T05:00:00.000Z',
  termination_date: null,
  position: 'Docente de Química',
  grade: null,
  extra: {},
  created_at: '2026-09-17T23:20:50.511Z',
  updated_at: '2026-09-17T23:20:50.511Z',
  completeness: {
    required: 3,
    present: 1,
    missing: ['Historia Laboral', 'Examen Médico Ocupacional'],
  },
};

const EXPEDIENTE: Expediente = {
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
};

const DOCUMENT: ApiDocument = {
  id: 'doc-1',
  title: 'Contrato laboral 2026',
  type: 'Contrato Laboral',
  module_code: 'HUMAN_RESOURCES',
  folio_index: 'RRHH-2026-0001',
  s3_key: 'k',
  s3_bucket: 'b',
  file_name: 'contrato.pdf',
  file_type: 'application/pdf',
  file_size: 2048,
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
  created_at: '2026-09-17T23:30:00.000Z',
  updated_at: '2026-09-17T23:30:00.000Z',
};

const EVENT: PersonEvent = {
  id: 'ev-1',
  person_id: 'per-1',
  event_type: 'INGRESO',
  title: 'Ingreso a la institución',
  description: 'Vinculación como docente',
  event_date: '2026-02-01T05:00:00.000Z',
  document_id: 'doc-1',
  created_by: 'u-1',
  created_by_user: { id: 'u-1', full_name: 'Administrador' },
  created_at: '2026-09-17T23:20:58.412Z',
};

const api = vi.hoisted(() => ({
  getPerson: vi.fn(),
  listPersonExpedientes: vi.fn(),
  listPersonDocuments: vi.fn(),
  listPersonEvents: vi.fn(),
  listAcademicPeriods: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  createPersonEvent: vi.fn(),
}));

vi.mock('@/api/people', () => api);
vi.mock('@/api/system', () => ({ getConfig: vi.fn() }));

function renderPerson() {
  return render(
    <MemoryRouter initialEntries={['/personas/per-1']}>
      <Routes>
        <Route path="/personas/:id" element={<PersonDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Ficha de persona', () => {
  beforeEach(() => {
    clearQueryCache();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getPerson.mockResolvedValue(PERSON);
    api.listPersonExpedientes.mockResolvedValue([EXPEDIENTE]);
    api.listPersonDocuments.mockResolvedValue({
      data: [DOCUMENT],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    api.listPersonEvents.mockResolvedValue([EVENT]);
    api.listAcademicPeriods.mockResolvedValue([]);
  });

  it('muestra la persona con la etiqueta de hoja de vida resuelta desde la configuración', async () => {
    renderPerson();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana Restrepo' })).toBeInTheDocument());
    expect(screen.getByText(/Empleado · documento F4-PROBE-001/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Hoja de vida — completitud documental/ }),
    ).toBeInTheDocument();
  });

  it('pinta el semáforo de completitud con los datos de `completeness`', async () => {
    renderPerson();

    await waitFor(() =>
      expect(screen.getByText('Hoja de vida: 1 de 3 documentos obligatorios')).toBeInTheDocument(),
    );

    const meter = screen.getByRole('progressbar');
    expect(meter).toHaveAttribute('aria-valuenow', '1');
    expect(meter).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('Falta: Historia Laboral')).toBeInTheDocument();
    expect(screen.getByText('Falta: Examen Médico Ocupacional')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('expone las cuatro pestañas con roles ARIA y abre Datos por defecto', async () => {
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs.some((text) => text?.includes('Datos'))).toBe(true);
    expect(tabs.some((text) => text?.includes('Expedientes'))).toBe(true);
    expect(tabs.some((text) => text?.includes('Documentos'))).toBe(true);
    expect(tabs.some((text) => text?.includes('Línea de tiempo'))).toBe(true);

    expect(screen.getByRole('tab', { name: /Datos/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Docente de Química')).toBeInTheDocument();
  });

  it('cambia a Expedientes y muestra el expediente laboral automático', async () => {
    const user = userEvent.setup();
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Expedientes/ }));

    expect(screen.getByText('TH-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Historia laboral — Ana Restrepo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /TH-2026-0001/ })).toHaveAttribute('href', '/expedientes/exp-1');
  });

  it('cambia a Documentos y lista los documentos paginados del servidor', async () => {
    const user = userEvent.setup();
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Documentos/ }));

    expect(screen.getByText('Contrato laboral 2026')).toBeInTheDocument();
    expect(screen.getByText('Folio RRHH-2026-0001')).toBeInTheDocument();
  });

  it('cambia a Línea de tiempo y muestra los eventos de seguimiento', async () => {
    const user = userEvent.setup();
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Línea de tiempo/ }));

    expect(screen.getByText('Ingreso a la institución')).toBeInTheDocument();
    expect(screen.getByText('INGRESO')).toBeInTheDocument();
    expect(screen.getByText(/Registrado por Administrador/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver documento vinculado/ })).toHaveAttribute(
      'href',
      '/documentos/doc-1',
    );
  });

  it('ofrece un estado vacío honesto cuando no hay eventos registrados', async () => {
    api.listPersonEvents.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Línea de tiempo/ }));

    expect(screen.getByText('Sin eventos de seguimiento')).toBeInTheDocument();
  });

  it('registra un evento nuevo contra POST /people/:id/events', async () => {
    api.createPersonEvent.mockResolvedValue(EVENT);
    const user = userEvent.setup();
    renderPerson();

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Línea de tiempo/ }));
    await user.click(screen.getByRole('button', { name: 'Registrar evento' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Tipo de evento/), 'EVALUACION');
    await user.type(within(dialog).getByLabelText(/^Título/), 'Evaluación de desempeño');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(api.createPersonEvent).toHaveBeenCalled());
    const [personId, payload] = api.createPersonEvent.mock.calls[0] as [string, Record<string, unknown>];
    expect(personId).toBe('per-1');
    expect(payload.event_type).toBe('EVALUACION');
    expect(payload.title).toBe('Evaluación de desempeño');
    expect(typeof payload.event_date).toBe('string');
  });
});
