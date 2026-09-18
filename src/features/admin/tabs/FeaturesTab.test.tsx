import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { FeaturesTab } from './FeaturesTab';
import type { Feature, FeatureCategory, Role, RoleFeature } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true, hasFeature: () => true }),
}));

const confirmMock = vi.fn();
vi.mock('@/contexts/DialogContext', () => ({
  useDialogs: () => ({ confirm: confirmMock, promptText: vi.fn() }),
}));

vi.mock('@/api/features', () => ({
  getFeatureMatrix: vi.fn(),
  setFeatureMatrixEntry: vi.fn(),
  setFeatureMatrixBulk: vi.fn(),
  resetFeatureMatrix: vi.fn(),
}));

import * as featuresApi from '@/api/features';

const ROLES: Role[] = [
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: null,
    has_full_access: true,
    can_manage_users: true,
    is_system: true,
  },
  {
    code: 'DOCENTE',
    name: 'Docente',
    description: null,
    has_full_access: false,
    can_manage_users: false,
    is_system: true,
  },
];

const CATEGORIES: FeatureCategory[] = [
  { code: 'DOCUMENTS', name: 'Documentos', description: null, sort_order: 1 },
  { code: 'ADMIN', name: 'Administración', description: null, sort_order: 2 },
];

const FEATURES: Feature[] = [
  {
    code: 'DOCUMENT_VIEW',
    name: 'Ver documentos',
    description: null,
    category_code: 'DOCUMENTS',
    is_core: false,
    is_sensitive: false,
    sort_order: 1,
  },
  {
    code: 'DOCUMENT_TRANSFER',
    name: 'Transferir documentos',
    description: null,
    category_code: 'DOCUMENTS',
    is_core: false,
    is_sensitive: true,
    sort_order: 2,
  },
  {
    code: 'USER_MANAGE',
    name: 'Gestionar usuarios',
    description: null,
    category_code: 'ADMIN',
    is_core: true,
    is_sensitive: false,
    sort_order: 3,
  },
];

const MATRIX: RoleFeature[] = [
  { role_code: 'ADMIN', feature_code: 'DOCUMENT_VIEW', enabled: true, updated_at: '2026-09-17T00:00:00Z' },
  {
    role_code: 'ADMIN',
    feature_code: 'DOCUMENT_TRANSFER',
    enabled: true,
    updated_at: '2026-09-17T00:00:00Z',
  },
  { role_code: 'ADMIN', feature_code: 'USER_MANAGE', enabled: true, updated_at: '2026-09-17T00:00:00Z' },
  {
    role_code: 'DOCENTE',
    feature_code: 'DOCUMENT_VIEW',
    enabled: true,
    updated_at: '2026-09-17T00:00:00Z',
  },
  {
    role_code: 'DOCENTE',
    feature_code: 'DOCUMENT_TRANSFER',
    enabled: false,
    updated_at: '2026-09-17T00:00:00Z',
  },
  { role_code: 'DOCENTE', feature_code: 'USER_MANAGE', enabled: false, updated_at: '2026-09-17T00:00:00Z' },
];

const reloadMock = vi.fn();

vi.mock('@/contexts/CatalogContext', () => ({
  useCatalogs: () => ({
    roles: ROLES,
    features: FEATURES,
    featureCategories: CATEGORIES,
    reload: reloadMock,
  }),
}));

function renderTab(): void {
  render(
    <MemoryRouter>
      <FeaturesTab />
    </MemoryRouter>,
  );
}

describe('FeaturesTab · matriz de características por rol', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(featuresApi.getFeatureMatrix).mockReset().mockResolvedValue(MATRIX);
    vi.mocked(featuresApi.setFeatureMatrixEntry).mockReset().mockResolvedValue(undefined);
    vi.mocked(featuresApi.setFeatureMatrixBulk).mockReset().mockResolvedValue(undefined);
    vi.mocked(featuresApi.resetFeatureMatrix).mockReset().mockResolvedValue(undefined);
    confirmMock.mockReset().mockResolvedValue(true);
  });

  it('pinta una columna por rol con su contador de activas', async () => {
    renderTab();

    expect(await screen.findByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Docente')).toBeInTheDocument();
    // ADMIN: las tres activas. DOCENTE: solo ver documentos.
    await waitFor(() => expect(screen.getByText('3/3')).toBeInTheDocument());
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('cambia una celda llamando a PUT /features/matrix', async () => {
    const user = userEvent.setup();
    renderTab();

    const cell = await screen.findByLabelText('Transferir documentos para Docente');
    expect(cell).not.toBeChecked();

    await user.click(cell);

    await waitFor(() =>
      expect(featuresApi.setFeatureMatrixEntry).toHaveBeenCalledWith({
        role_code: 'DOCENTE',
        feature_code: 'DOCUMENT_TRANSFER',
        enabled: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument());
  });

  it('activa toda una categoría de una vez con el interruptor del grupo', async () => {
    const user = userEvent.setup();
    renderTab();

    const group = await screen.findByLabelText('Toda la categoría Documentos para Docente');
    await user.click(group);

    await waitFor(() =>
      expect(featuresApi.setFeatureMatrixBulk).toHaveBeenCalledWith({
        role_code: 'DOCENTE',
        features: [
          { code: 'DOCUMENT_VIEW', enabled: true },
          { code: 'DOCUMENT_TRANSFER', enabled: true },
        ],
      }),
    );
  });

  it('bloquea la celda núcleo de un rol de acceso total y lo explica', async () => {
    const user = userEvent.setup();
    renderTab();

    const locked = await screen.findByLabelText('Gestionar usuarios para Administrador');
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();
    expect(
      screen.getByText(/es una característica núcleo y Administrador tiene acceso total/i),
    ).toBeInTheDocument();

    await user.click(locked);
    expect(featuresApi.setFeatureMatrixEntry).not.toHaveBeenCalled();
  });

  it('excluye las núcleo del lote cuando se apaga una categoría en un rol de acceso total', async () => {
    const user = userEvent.setup();
    renderTab();

    const group = await screen.findByLabelText('Toda la categoría Administración para Administrador');
    // Solo hay una característica en la categoría y es núcleo: no se puede tocar.
    expect(group).toBeDisabled();
    await user.click(group);
    expect(featuresApi.setFeatureMatrixBulk).not.toHaveBeenCalled();
  });

  it('restaura los valores por defecto tras confirmar', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Restaurar toda la matriz' }));

    await waitFor(() => expect(featuresApi.resetFeatureMatrix).toHaveBeenCalledWith(undefined));
  });

  it('revierte la celda y muestra el mensaje del servidor si el cambio se rechaza', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('@/api/client');
    vi.mocked(featuresApi.setFeatureMatrixEntry).mockRejectedValue(
      new ApiError('CORE_FEATURE', 'No se puede desactivar una característica núcleo.', 409),
    );

    renderTab();
    const cell = await screen.findByLabelText('Transferir documentos para Docente');
    await user.click(cell);

    await waitFor(() => expect(cell).not.toBeChecked());
  });
});
