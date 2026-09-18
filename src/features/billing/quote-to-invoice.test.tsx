import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { clearQueryCache } from '@/hooks/useQuery';
import { InvoicesTab } from './tabs/InvoicesTab';
import { QuotesTab } from './tabs/QuotesTab';
import type { Client, Invoice, LicensePlan, Paginated, Payment, Quote } from '@/types/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminArea: true, hasFeature: () => true }),
}));

const confirmMock = vi.fn();
const promptMock = vi.fn();
vi.mock('@/contexts/DialogContext', () => ({
  useDialogs: () => ({ confirm: confirmMock, promptText: promptMock }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/api/billing', () => ({
  listQuotes: vi.fn(),
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  convertQuote: vi.fn(),
  setQuoteStatus: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  downloadQuotePdf: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  issueInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  createPayment: vi.fn(),
  downloadInvoicePdf: vi.fn(),
}));

import * as billingApi from '@/api/billing';
import toast from 'react-hot-toast';

const successToast = vi.mocked(toast.success);

const CLIENTS: Client[] = [
  {
    id: 'cli-1',
    name: 'Colegio Alemán de Barranquilla',
    legal_name: null,
    document_type: 'NIT',
    document_number: '890.000.000-1',
    tax_regime: null,
    address: null,
    city: null,
    state: null,
    country: 'Colombia',
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    status: 'ACTIVE',
    notes: null,
    created_by: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
  },
];

const PLANS: LicensePlan[] = [
  {
    code: 'ANUAL_PREMIUM',
    name: 'Anual Premium',
    description: null,
    billing_period: 'ANNUAL',
    price_amount: '24000000.00',
    currency: 'COP',
    storage_gb: null,
    max_users: null,
    features: null,
    is_active: true,
    sort_order: 1,
  },
];

const QUOTE: Quote = {
  id: 'quo-1',
  client_id: 'cli-1',
  client_name: 'Colegio Alemán de Barranquilla',
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
  sent_at: '2026-02-10T10:00:00.000Z',
  decided_at: '2026-02-20T10:00:00.000Z',
  created_at: '2026-02-10T10:00:00.000Z',
  updated_at: '2026-02-20T10:00:00.000Z',
};

const INVOICE_FROM_QUOTE: Invoice = {
  id: 'inv-1',
  client_id: 'cli-1',
  client_name: 'Colegio Alemán de Barranquilla',
  quote_id: 'quo-1',
  license_id: null,
  number: 'FAC-2026-0001',
  issue_date: '2026-03-01',
  due_date: '2026-03-31',
  status: 'ISSUED',
  currency: 'COP',
  subtotal: '24000000.00',
  tax_rate: '0.19',
  tax_amount: '4560000.00',
  total: '28560000.00',
  paid_amount: '0.00',
  balance: '28560000.00',
  cufe: null,
  notes: null,
  created_by: null,
  issued_at: '2026-03-01T10:00:00.000Z',
  voided_at: null,
  void_reason: null,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z',
};

const PAYMENT: Payment = {
  id: 'pay-1',
  invoice_id: 'inv-1',
  client_id: 'cli-1',
  payment_date: '2026-04-02',
  amount: '20000000.00',
  currency: 'COP',
  method: 'TRANSFER',
  reference: null,
  notes: null,
  registered_by: null,
  created_at: '2026-04-02T10:00:00.000Z',
};

function page<T>(rows: T[]): Paginated<T> {
  return { data: rows, page: 1, pageSize: 20, total: rows.length };
}

/**
 * `DataTable` pinta a la vez la tabla (escritorio) y las tarjetas (móvil): en
 * jsdom conviven las dos, así que las consultas se acotan a la tabla.
 */
async function table(): Promise<HTMLElement> {
  return screen.findByRole('table');
}

describe('Recorrido comercial · de cotización a factura con su saldo', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
    promptMock.mockResolvedValue('Motivo de prueba');
    vi.mocked(billingApi.listQuotes).mockResolvedValue(page([QUOTE]));
    vi.mocked(billingApi.listInvoices).mockResolvedValue(page([INVOICE_FROM_QUOTE]));
    vi.mocked(billingApi.convertQuote).mockResolvedValue(INVOICE_FROM_QUOTE);
    vi.mocked(billingApi.createPayment).mockResolvedValue(PAYMENT);
    vi.mocked(billingApi.getInvoice).mockResolvedValue({
      ...INVOICE_FROM_QUOTE,
      status: 'PARTIAL',
      paid_amount: '20000000.00',
      balance: '8560000.00',
    });
  });

  function renderQuotes(): void {
    render(
      <MemoryRouter>
        <QuotesTab
          clients={CLIENTS}
          plans={PLANS}
          defaults={{ tax_rate: 0.19, quote_validity_days: 30 }}
        />
      </MemoryRouter>,
    );
  }

  function renderInvoices(): void {
    render(
      <MemoryRouter>
        <InvoicesTab
          clients={CLIENTS}
          plans={PLANS}
          defaults={{ tax_rate: 0.19, payment_terms_days: 30 }}
        />
      </MemoryRouter>,
    );
  }

  it('muestra la cotización con el total y el impuesto que devuelve el servidor', async () => {
    renderQuotes();

    const grid = within(await table());
    expect(grid.getByText('COT-2026-0001')).toBeInTheDocument();
    // "Aceptada" aparece como insignia y como opción del selector de estado.
    expect(grid.getAllByText('Aceptada').length).toBeGreaterThan(0);
    // 0,19 se publica como fracción y se presenta como 19 %.
    expect(grid.getByText('19 %')).toBeInTheDocument();
    expect(grid.getByText(/28\.560\.000/)).toBeInTheDocument();
  });

  it('convierte la cotización aceptada e informa del saldo de la factura creada', async () => {
    const user = userEvent.setup();
    renderQuotes();

    const button = within(await table()).getByLabelText('Convertir COT-2026-0001 en factura');
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(billingApi.convertQuote).toHaveBeenCalledWith('quo-1'));
    await waitFor(() =>
      expect(successToast).toHaveBeenCalledWith(expect.stringContaining('FAC-2026-0001')),
    );
    expect(successToast).toHaveBeenCalledWith(expect.stringMatching(/28\.560\.000/));
  });

  it('no deja convertir una cotización que no está aceptada', async () => {
    vi.mocked(billingApi.listQuotes).mockResolvedValue(page([{ ...QUOTE, status: 'SENT' }]));
    renderQuotes();

    const button = within(await table()).getByLabelText('Convertir COT-2026-0001 en factura');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Solo se convierten las cotizaciones aceptadas');
  });

  it('muestra la factura con su saldo pendiente', async () => {
    renderInvoices();

    const row = within(await table()).getByText('FAC-2026-0001').closest('tr') as HTMLElement;
    expect(within(row).getByText('Emitida')).toBeInTheDocument();
    // Total y saldo coinciden porque todavía no hay pagos.
    expect(within(row).getAllByText(/28\.560\.000/).length).toBe(2);
  });

  it('registra un pago y relee el saldo recalculado por el servidor', async () => {
    const user = userEvent.setup();
    renderInvoices();

    await user.click(
      within(await table()).getByLabelText('Registrar un pago de FAC-2026-0001'),
    );

    const amount = await screen.findByLabelText(/Importe/);
    await user.clear(amount);
    await user.type(amount, '20000000');
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() =>
      expect(billingApi.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ invoice_id: 'inv-1', amount: 20000000, method: 'TRANSFER' }),
      ),
    );
    // El saldo no se calcula en el cliente: se vuelve a pedir la factura.
    await waitFor(() => expect(billingApi.getInvoice).toHaveBeenCalledWith('inv-1'));
    await waitFor(() =>
      expect(successToast).toHaveBeenCalledWith(expect.stringMatching(/Saldo de la factura: .*8\.560\.000/)),
    );
  });

  it('exige motivo para anular y conserva el consecutivo', async () => {
    const user = userEvent.setup();
    vi.mocked(billingApi.voidInvoice).mockResolvedValue({
      ...INVOICE_FROM_QUOTE,
      status: 'VOID',
      void_reason: 'Motivo de prueba',
    });
    renderInvoices();

    await user.click(within(await table()).getByLabelText('Anular FAC-2026-0001'));

    await waitFor(() =>
      expect(billingApi.voidInvoice).toHaveBeenCalledWith('inv-1', 'Motivo de prueba'),
    );
    expect(promptMock).toHaveBeenCalledWith(
      expect.objectContaining({ required: true, title: 'Anular factura' }),
    );
  });
});
