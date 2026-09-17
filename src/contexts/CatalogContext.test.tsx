import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CatalogProvider, useCatalogs } from './CatalogContext';
import type { Catalogs } from '@/types/api';

const CATALOGS: Catalogs = {
  modules: [
    {
      code: 'ACADEMIC',
      name: 'Gestión Académica',
      description: 'Expediente único del estudiante',
      icon: 'GraduationCap',
      color: '#60a5fa',
      s3_folder: 'academico',
      folio_prefix: 'AC',
      radicado_prefix: 'AC',
      sort_order: 1,
      is_active: true,
    },
    {
      code: 'LEGACY',
      name: 'Dependencia archivada',
      description: null,
      icon: 'Archive',
      color: '#a1a1aa',
      s3_folder: 'legacy',
      folio_prefix: 'LG',
      radicado_prefix: 'LG',
      sort_order: 0,
      is_active: false,
    },
  ],
  roles: [
    {
      code: 'ADMIN',
      name: 'Administrador',
      description: null,
      has_full_access: true,
      can_manage_users: true,
      is_system: true,
    },
  ],
  document_statuses: [
    {
      code: 'ARCHIVO_GESTION',
      name: 'Archivo de gestión',
      color: '#34d399',
      is_terminal: false,
      allows_edit: true,
      sort_order: 1,
    },
  ],
  dispositions: [{ code: 'CONSERVAR', name: 'Conservación total', color: '#34d399', action: 'KEEP' }],
  notification_types: [{ code: 'LOAN', name: 'Préstamo', icon: 'BookOpen', color: '#38bdf8' }],
  correspondence_types: [{ code: 'E', name: 'Entrada', prefix: 'E', response_days: 15 }],
  person_types: [{ code: 'EMPLOYEE', name: 'Empleado' }],
  settings: {
    max_file_size_mb: 50,
    allowed_mime_types: { 'application/pdf': ['.pdf'] },
    trash_retention_days: 30,
    password_min_length: 8,
    app_name: 'EduArchive',
    institution_name: 'Colegio Alemán',
    ai_enabled: true,
    storage_configured: true,
    smtp_configured: false,
  },
};

function Probe(): React.JSX.Element {
  const catalogs = useCatalogs();
  return (
    <dl>
      <dd data-testid="module-label">{catalogs.moduleLabel('ACADEMIC')}</dd>
      <dd data-testid="module-color">{catalogs.moduleColor('ACADEMIC')}</dd>
      <dd data-testid="module-icon">{catalogs.moduleIcon('ACADEMIC')}</dd>
      <dd data-testid="status-label">{catalogs.statusLabel('ARCHIVO_GESTION')}</dd>
      <dd data-testid="disposition-label">{catalogs.dispositionLabel('CONSERVAR')}</dd>
      <dd data-testid="role-label">{catalogs.roleLabel('ADMIN')}</dd>
      <dd data-testid="unknown-module">{catalogs.moduleLabel('NO_EXISTE')}</dd>
      <dd data-testid="null-status">{catalogs.statusLabel(null)}</dd>
      <dd data-testid="active-count">{catalogs.activeModules.length}</dd>
      <dd data-testid="active-first">{catalogs.activeModules[0]?.code ?? ''}</dd>
      <dd data-testid="max-size">{catalogs.settings?.max_file_size_mb ?? ''}</dd>
    </dl>
  );
}

describe('CatalogContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  async function renderWithCatalogs(): Promise<void> {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(CATALOGS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    render(
      <CatalogProvider enabled>
        <Probe />
      </CatalogProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('module-label')).toHaveTextContent('Gestión Académica');
    });
  }

  it('expone helpers resueltos desde el catálogo', async () => {
    await renderWithCatalogs();

    expect(screen.getByTestId('module-color')).toHaveTextContent('#60a5fa');
    expect(screen.getByTestId('module-icon')).toHaveTextContent('GraduationCap');
    expect(screen.getByTestId('status-label')).toHaveTextContent('Archivo de gestión');
    expect(screen.getByTestId('disposition-label')).toHaveTextContent('Conservación total');
    expect(screen.getByTestId('role-label')).toHaveTextContent('Administrador');
    expect(screen.getByTestId('max-size')).toHaveTextContent('50');
  });

  it('devuelve el código como etiqueta cuando no está en el catálogo', async () => {
    await renderWithCatalogs();
    expect(screen.getByTestId('unknown-module')).toHaveTextContent('NO_EXISTE');
    expect(screen.getByTestId('null-status')).toHaveTextContent('—');
  });

  it('filtra módulos inactivos y los ordena por sort_order', async () => {
    await renderWithCatalogs();
    expect(screen.getByTestId('active-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-first')).toHaveTextContent('ACADEMIC');
  });

  it('guarda los catálogos en sessionStorage para recargas rápidas', async () => {
    await renderWithCatalogs();
    await waitFor(() => {
      expect(sessionStorage.getItem('eduarchive.catalogs')).not.toBeNull();
    });
  });

  it('no consulta el API cuando no hay sesión', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CatalogProvider enabled={false}>
        <Probe />
      </CatalogProvider>,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('module-label')).toHaveTextContent('ACADEMIC');
  });
});
