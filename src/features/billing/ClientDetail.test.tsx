import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { ClientDetail } from './ClientDetail';
import type { ClientSummary } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true, hasFeature: () => true }),
}));

vi.mock('@/api/billing', () => ({
  getClientSummary: vi.fn(),
}));

import * as billingApi from '@/api/billing';

/**
 * Respuesta de `GET /clients/:id/summary` con los importes tal como los
 * entrega PostgreSQL (`NUMERIC` serializado como cadena).
 */
const SUMMARY: ClientSummary = {
  client: {
    id: 'cli-1',
    name: 'Colegio Alemán de Barranquilla',
    legal_name: 'Corporación Cultural Colegio Alemán de Barranquilla',
    document_type: 'NIT',
    document_number: '890.000.000-1',
    tax_regime: 'Común',
    address: 'Km 5 vía Puerto Colombia',
    city: 'Barranquilla',
    state: 'Atlántico',
    country: 'Colombia',
    contact_name: 'Ana Restrepo',
    contact_email: 'ana@example.org',
    contact_phone: '3000000000',
    status: 'ACTIVE',
    notes: null,
    created_by: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  },
  active_license: {
    id: 'lic-1',
    client_id: 'cli-1',
    plan_code: 'ANUAL_PREMIUM',
    plan_name: 'Anual Premium',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'ACTIVE',
    seats: 120,
    storage_gb: null,
    price_amount: '24000000.00',
    currency: 'COP',
    auto_renew: true,
    notes: null,
    created_by: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
  },
  licenses: [],
  totals: {
    invoiced: '28560000.00',
    paid: '20000000.00',
    balance: '8560000.00',
    overdue: '0.00',
  },
  last_quotes: [
    {
      id: 'quo-1',
      client_id: 'cli-1',
      number: 'COT-2026-0001',
      issue_date: '2026-02-10',
      valid_until: '2026-03-10',
      status: 'ACCEPTED',
      currency: 'COP',
      subtotal: '24000000.00',
      tax_rate: '0.19',
      tax_amount: '4560000.00',
      total: '28560000.00',
      notes: null,
      terms: null,
      created_by: null,
      sent_at: null,
      decided_at: null,
      created_at: '2026-02-10T10:00:00.000Z',
      updated_at: '2026-02-10T10:00:00.000Z',
    },
  ],
  last_invoices: [
    {
      id: 'inv-1',
      client_id: 'cli-1',
      quote_id: 'quo-1',
      license_id: 'lic-1',
      number: 'FAC-2026-0001',
      issue_date: '2026-03-01',
      due_date: '2026-03-31',
      status: 'PARTIAL',
      currency: 'COP',
      subtotal: '24000000.00',
      tax_rate: '0.19',
      tax_amount: '4560000.00',
      total: '28560000.00',
      paid_amount: '20000000.00',
      balance: '8560000.00',
      cufe: null,
      notes: null,
      created_by: null,
      issued_at: '2026-03-01T10:00:00.000Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-03-01T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    },
  ],
  last_payments: [
    {
      id: 'pay-1',
      invoice_id: 'inv-1',
      invoice_number: 'FAC-2026-0001',
      client_id: 'cli-1',
      payment_date: '2026-04-02',
      amount: '20000000.00',
      currency: 'COP',
      method: 'TRANSFER',
      reference: 'REF-778',
      notes: null,
      registered_by: null,
      created_at: '2026-04-02T10:00:00.000Z',
    },
  ],
};

function renderDetail(): void {
  render(
    <MemoryRouter>
      <ClientDetail clientId="cli-1" />
    </MemoryRouter>,
  );
}

describe('ClientDetail · vista de 360° del cliente', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(billingApi.getClientSummary).mockReset().mockResolvedValue(SUMMARY);
  });

  it('muestra los totales que devuelve el servidor en pesos con separador de miles', async () => {
    renderDetail();

    // 28.560.000 y 8.560.000 salen de `totals`, no de una suma del cliente.
    await screen.findByText('Facturado');
    const facturado = screen.getByText('Facturado').parentElement as HTMLElement;
    expect(facturado).toHaveTextContent(/28\.560\.000/);
    const saldo = screen.getByText('Saldo').parentElement as HTMLElement;
    expect(saldo).toHaveTextContent(/8\.560\.000/);
    const pagado = screen.getByText('Pagado').parentElement as HTMLElement;
    expect(pagado).toHaveTextContent(/20\.000\.000/);
    expect(billingApi.getClientSummary).toHaveBeenCalledWith('cli-1', expect.anything());
  });

  it('describe la licencia vigente con su vigencia y lo contratado', async () => {
    renderDetail();

    expect(await screen.findByText('Anual Premium')).toBeInTheDocument();
    expect(screen.getByText('120 usuarios')).toBeInTheDocument();
    expect(screen.getByText('Almacenamiento ilimitado')).toBeInTheDocument();
    expect(screen.getByText('Renovación automática')).toBeInTheDocument();
  });

  it('ordena la línea de tiempo de lo más reciente a lo más antiguo', async () => {
    renderDetail();

    const timeline = (await screen.findByText('Línea de tiempo')).parentElement as HTMLElement;
    const items = within(timeline).getAllByRole('listitem');

    // Pago (2026-04-02) → factura (2026-03-01) → cotización (2026-02-10).
    expect(items[0]).toHaveTextContent('Pago REF-778');
    expect(items[1]).toHaveTextContent('Factura FAC-2026-0001');
    expect(items[2]).toHaveTextContent('Cotización COT-2026-0001');
  });

  it('muestra el saldo de la factura dentro de la línea de tiempo', async () => {
    renderDetail();

    const invoice = (await screen.findByText('Factura FAC-2026-0001')).closest('li') as HTMLElement;
    expect(invoice).toHaveTextContent('Pago parcial');
    expect(invoice).toHaveTextContent(/saldo .*8\.560\.000/);
  });

  it('no afirma en ninguna parte que sea factura electrónica DIAN', async () => {
    renderDetail();

    await screen.findByText('Anual Premium');
    expect(screen.getByText(/no constituye factura electrónica válida ante la DIAN/i)).toBeInTheDocument();
  });

  it('declara el estado vacío cuando el cliente no tiene movimientos', async () => {
    vi.mocked(billingApi.getClientSummary).mockResolvedValue({
      ...SUMMARY,
      active_license: null,
      licenses: [],
      last_quotes: [],
      last_invoices: [],
      last_payments: [],
    });

    renderDetail();

    expect(await screen.findByText('Sin movimientos')).toBeInTheDocument();
    expect(
      screen.getByText('Este cliente no tiene una licencia vigente registrada.'),
    ).toBeInTheDocument();
  });
});
