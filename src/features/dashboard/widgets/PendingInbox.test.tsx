import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PendingInbox } from './PendingInbox';
import type { DashboardStats } from '@/types/api';

/** Respuesta real de `GET /stats/dashboard` recortada a `pending_actions`. */
const ACTIONS: DashboardStats['pending_actions'] = {
  deletion_requests: 2,
  overdue_loans: 1,
  without_trd: 14,
  without_folio: 7,
  without_expediente: 0,
};

function renderInbox(props: Partial<React.ComponentProps<typeof PendingInbox>> = {}) {
  return render(
    <MemoryRouter>
      <PendingInbox
        actions={ACTIONS}
        retentionSoon={3}
        loansDueSoon={4}
        isAdminArea
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('Bandeja de pendientes', () => {
  it('muestra una tarjeta por cada pendiente con su contador', () => {
    renderInbox();

    expect(screen.getByRole('heading', { name: /Bandeja de pendientes/ })).toBeInTheDocument();
    expect(screen.getByText('Sin clasificación TRD')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Sin foliar')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Solicitudes de eliminación')).toBeInTheDocument();
    expect(screen.getByText('Préstamos vencidos')).toBeInTheDocument();
    expect(screen.getByText('Préstamos por vencer')).toBeInTheDocument();
    expect(screen.getByText('Retenciones próximas')).toBeInTheDocument();
  });

  it('oculta los pendientes con valor cero (sin expediente = 0)', () => {
    renderInbox();
    expect(screen.queryByText('Sin expediente')).not.toBeInTheDocument();
  });

  it('cada tarjeta enlaza a la vista que resuelve ese pendiente', () => {
    renderInbox();

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(hrefs).toContain('/estadisticas?tab=general');
    expect(hrefs).toContain('/estadisticas?tab=modulo');
    expect(hrefs).toContain('/admin/eliminaciones');
    expect(hrefs).toContain('/admin/prestamos?estado=OVERDUE');
    expect(hrefs).toContain('/admin/prestamos?estado=ACTIVE');
    expect(hrefs).toContain('/estadisticas?tab=alertas');
  });

  it('envía a papelera y alertas cuando el usuario no es administrador', () => {
    renderInbox({ isAdminArea: false });

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/papelera');
    expect(hrefs).not.toContain('/admin/eliminaciones');
  });

  it('declara la bandeja vacía en lugar de desaparecer cuando no hay pendientes', () => {
    renderInbox({
      actions: {
        deletion_requests: 0,
        overdue_loans: 0,
        without_trd: 0,
        without_folio: 0,
        without_expediente: 0,
      },
      retentionSoon: 0,
      loansDueSoon: 0,
    });

    expect(screen.getByText(/No hay pendientes/)).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('muestra esqueletos mientras llegan las alertas del servidor', () => {
    renderInbox({ loading: true });

    expect(screen.queryByText('Sin clasificación TRD')).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay pendientes/)).not.toBeInTheDocument();
  });
});
