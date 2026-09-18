import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, ensureUser, loginAdmin, loginAs, TEST_PASSWORD } from './helpers.js';
import { closePool, many, one, query } from '../src/db/pool.js';

/**
 * Panel comercial (docs/FACTURACION.md).
 *
 * Recorrido completo: cliente → cotización → aceptación → factura → emisión →
 * pagos → PDF. Incluye los consecutivos bajo concurrencia y las reglas de
 * inmutabilidad de una factura pagada o anulada.
 */
describe('Panel comercial', () => {
  let adminToken = '';
  let docenteToken = '';
  let clientId = '';

  async function nuevaCotizacion(total = 1_000_000): Promise<Record<string, unknown>> {
    const res = await request(app)
      .post('/api/quotes')
      .set(auth(adminToken))
      .send({
        client_id: clientId,
        items: [{ description: 'Plan mensual institucional', quantity: 1, unit_price: total }],
      });
    expect(res.status).toBe(201);
    return res.body as Record<string, unknown>;
  }

  /** Cotización aceptada → factura emitida, lista para recibir pagos. */
  async function facturaEmitida(total = 1_000_000): Promise<Record<string, unknown>> {
    const quote = await nuevaCotizacion(total);
    await request(app).post(`/api/quotes/${quote.id}/status`).set(auth(adminToken)).send({ status: 'SENT' });
    await request(app).post(`/api/quotes/${quote.id}/status`).set(auth(adminToken)).send({ status: 'ACCEPTED' });
    const invoice = await request(app).post(`/api/quotes/${quote.id}/convert`).set(auth(adminToken));
    expect(invoice.status).toBe(201);
    const issued = await request(app).post(`/api/invoices/${invoice.body.id}/issue`).set(auth(adminToken));
    expect(issued.status).toBe(200);
    return issued.body as Record<string, unknown>;
  }

  beforeAll(async () => {
    const admin = await loginAdmin();
    adminToken = admin.token;
    await ensureUser('comercial.docente@test.local', 'DOCENTE');
    docenteToken = (await loginAs('comercial.docente@test.local', TEST_PASSWORD)).token;

    const client = await request(app)
      .post('/api/clients')
      .set(auth(adminToken))
      .send({
        name: 'Colegio de Pruebas',
        legal_name: 'Corporación Colegio de Pruebas',
        document_type: 'NIT',
        document_number: `900${Date.now()}`.slice(0, 12),
        contact_email: 'contacto@colegio.test',
        status: 'ACTIVE',
      });
    expect(client.status).toBe(201);
    clientId = client.body.id as string;
  });

  afterAll(async () => {
    await query('DELETE FROM payments WHERE client_id = $1', [clientId]);
    await query('DELETE FROM invoices WHERE client_id = $1', [clientId]);
    await query('DELETE FROM quotes WHERE client_id = $1', [clientId]);
    await query('DELETE FROM licenses WHERE client_id = $1', [clientId]);
    await query('DELETE FROM clients WHERE id = $1', [clientId]);
    await closePool();
  });

  // ── Catálogo de planes ────────────────────────────────────

  it('los tres planes del sitio público viven en la base', async () => {
    const res = await request(app).get('/api/license-plans').set(auth(adminToken));
    expect(res.status).toBe(200);
    const planes = res.body as { code: string; price_amount: number | null; billing_period: string }[];
    const porCodigo = new Map(planes.map((p) => [p.code, p]));

    expect(Number(porCodigo.get('MENSUAL_INSTITUCIONAL')?.price_amount)).toBe(1_700_000);
    expect(porCodigo.get('MENSUAL_INSTITUCIONAL')?.billing_period).toBe('MONTHLY');
    expect(Number(porCodigo.get('ANUAL_PREMIUM')?.price_amount)).toBe(10_000_000);
    expect(porCodigo.get('ANUAL_PREMIUM')?.billing_period).toBe('ANNUAL');
    expect(porCodigo.get('RED_EDUCATIVA')?.price_amount).toBeNull();
    expect(porCodigo.get('RED_EDUCATIVA')?.billing_period).toBe('CUSTOM');
  });

  it('el panel comercial exige BILLING_VIEW', async () => {
    const res = await request(app).get('/api/clients').set(auth(docenteToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
    expect(res.body.error.details.feature).toBe('BILLING_VIEW');
  });

  // ── Impuestos y redondeo ──────────────────────────────────

  it('el impuesto sale de system_config.billing y se calcula sobre el subtotal', async () => {
    const quote = await nuevaCotizacion(1_700_000);
    expect(Number(quote.tax_rate)).toBe(19);
    expect(Number(quote.subtotal)).toBe(1_700_000);
    expect(Number(quote.tax_amount)).toBe(323_000);
    expect(Number(quote.total)).toBe(2_023_000);
    expect(String(quote.number)).toMatch(/^COT-\d{4}-\d{4}$/);
    expect(String(quote.issue_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(quote.valid_until)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('los importes se guardan en NUMERIC, no en coma flotante', async () => {
    const columnas = await many<{ column_name: string; data_type: string; numeric_scale: number }>(
      `SELECT column_name, data_type, numeric_scale
         FROM information_schema.columns
        WHERE table_name IN ('quotes','invoices','payments','quote_items','invoice_items','licenses','license_plans')
          AND column_name IN ('subtotal','tax_amount','total','paid_amount','balance','amount','unit_price','price_amount')`,
    );
    expect(columnas.length).toBeGreaterThan(10);
    for (const col of columnas) {
      expect(col.data_type, `${col.column_name} debería ser numeric`).toBe('numeric');
      expect(Number(col.numeric_scale)).toBe(2);
    }
  });

  // ── Consecutivos bajo concurrencia ────────────────────────

  it('20 cotizaciones simultáneas obtienen consecutivos únicos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/quotes')
          .set(auth(adminToken))
          .send({
            client_id: clientId,
            items: [{ description: `Concurrencia ${i}`, quantity: 1, unit_price: 100_000 }],
          }),
      ),
    );
    for (const res of resultados) expect(res.status).toBe(201);
    const numeros = resultados.map((r) => r.body.number as string);
    expect(new Set(numeros).size, `consecutivos repetidos: ${numeros.join(', ')}`).toBe(20);
  });

  it('20 facturas emitidas simultáneamente obtienen consecutivos únicos', async () => {
    const borradores = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/invoices')
          .set(auth(adminToken))
          .send({
            client_id: clientId,
            items: [{ description: `Factura concurrente ${i}`, quantity: 1, unit_price: 50_000 }],
          }),
      ),
    );
    for (const res of borradores) expect(res.status).toBe(201);

    const emitidas = await Promise.all(
      borradores.map((res) => request(app).post(`/api/invoices/${res.body.id}/issue`).set(auth(adminToken))),
    );
    for (const res of emitidas) expect(res.status).toBe(200);
    const numeros = emitidas.map((r) => r.body.number as string);
    expect(numeros.every((n) => /^FAC-\d{4}-\d{4}$/.test(n))).toBe(true);
    expect(new Set(numeros).size, `consecutivos repetidos: ${numeros.join(', ')}`).toBe(20);
  });

  // ── Recorrido completo ────────────────────────────────────

  it('cotizar, aceptar, convertir, emitir y cobrar deja la factura PAGADA', async () => {
    const quote = await nuevaCotizacion(1_000_000);

    const enviada = await request(app)
      .post(`/api/quotes/${quote.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'SENT' });
    expect(enviada.status).toBe(200);
    expect(enviada.body.sent_at).not.toBeNull();

    const aceptada = await request(app)
      .post(`/api/quotes/${quote.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'ACCEPTED' });
    expect(aceptada.body.status).toBe('ACCEPTED');

    const factura = await request(app).post(`/api/quotes/${quote.id}/convert`).set(auth(adminToken));
    expect(factura.status).toBe(201);
    expect(factura.body.quote_id).toBe(quote.id);
    expect(factura.body.status).toBe('DRAFT');
    expect(factura.body.number).toBeNull();
    expect(Number(factura.body.total)).toBe(1_190_000);
    expect(factura.body.cufe, 'el CUFE queda preparado y vacío').toBeNull();

    // Sin emitir no se cobra.
    const prematuro = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: factura.body.id, amount: 100 });
    expect(prematuro.status).toBe(409);

    const emitida = await request(app).post(`/api/invoices/${factura.body.id}/issue`).set(auth(adminToken));
    expect(emitida.status).toBe(200);
    expect(emitida.body.status).toBe('ISSUED');
    expect(String(emitida.body.number)).toMatch(/^FAC-\d{4}-\d{4}$/);
    expect(emitida.body.issued_at).not.toBeNull();
    expect(String(emitida.body.due_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(emitida.body.balance)).toBe(1_190_000);

    const parcial = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: factura.body.id, amount: 500_000, method: 'TRANSFER', reference: 'ABONO-1' });
    expect(parcial.status).toBe(201);
    expect(parcial.body.invoice.status).toBe('PARTIAL');
    expect(Number(parcial.body.invoice.paid_amount)).toBe(500_000);
    expect(Number(parcial.body.invoice.balance)).toBe(690_000);

    // Un pago mayor que el saldo se rechaza.
    const excesivo = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: factura.body.id, amount: 1_000_000 });
    expect(excesivo.status).toBe(409);

    const resto = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: factura.body.id, amount: 690_000, method: 'PSE', reference: 'ABONO-2' });
    expect(resto.status).toBe(201);
    expect(resto.body.invoice.status).toBe('PAID');
    expect(Number(resto.body.invoice.balance)).toBe(0);
  });

  it('revertir un pago devuelve el saldo y conserva el registro con su motivo', async () => {
    const invoice = await facturaEmitida(1_000_000);
    const pago = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: invoice.id, amount: 1_190_000 });
    expect(pago.body.invoice.status).toBe('PAID');

    const sinMotivo = await request(app).delete(`/api/payments/${pago.body.payment.id}`).set(auth(adminToken)).send({});
    expect(sinMotivo.status).toBe(400);

    const revertido = await request(app)
      .delete(`/api/payments/${pago.body.payment.id}`)
      .set(auth(adminToken))
      .send({ reason: 'El banco devolvió la transferencia' });
    expect(revertido.status).toBe(200);
    expect(revertido.body.invoice.status).toBe('ISSUED');
    expect(Number(revertido.body.invoice.paid_amount)).toBe(0);
    expect(Number(revertido.body.invoice.balance)).toBe(1_190_000);

    // Nada se borra: el pago sigue ahí, marcado y con su motivo.
    const fila = await one<{ reversed_at: string | null; reversal_reason: string | null }>(
      'SELECT reversed_at, reversal_reason FROM payments WHERE id = $1',
      [pago.body.payment.id],
    );
    expect(fila?.reversed_at).not.toBeNull();
    expect(fila?.reversal_reason).toBe('El banco devolvió la transferencia');

    const doble = await request(app)
      .delete(`/api/payments/${pago.body.payment.id}`)
      .set(auth(adminToken))
      .send({ reason: 'Otra vez' });
    expect(doble.status).toBe(409);
  });

  it('una factura PAGADA no admite cambios ni pagos nuevos', async () => {
    const invoice = await facturaEmitida(200_000);
    const pago = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: invoice.id, amount: 238_000 });
    expect(pago.body.invoice.status).toBe('PAID');

    const edicion = await request(app)
      .patch(`/api/invoices/${invoice.id}`)
      .set(auth(adminToken))
      .send({ items: [{ description: 'Otra línea', quantity: 1, unit_price: 1 }] });
    expect(edicion.status).toBe(409);

    const otroPago = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: invoice.id, amount: 1 });
    expect(otroPago.status).toBe(409);
  });

  it('anular exige motivo, conserva el consecutivo y cierra la factura', async () => {
    const invoice = await facturaEmitida(300_000);
    const numero = invoice.number as string;

    const sinMotivo = await request(app).post(`/api/invoices/${invoice.id}/void`).set(auth(adminToken)).send({});
    expect(sinMotivo.status).toBe(400);

    const anulada = await request(app)
      .post(`/api/invoices/${invoice.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Error en los datos del cliente' });
    expect(anulada.status).toBe(200);
    expect(anulada.body.status).toBe('VOID');
    expect(anulada.body.number, 'el consecutivo no se libera').toBe(numero);
    expect(anulada.body.void_reason).toBe('Error en los datos del cliente');
    expect(anulada.body.voided_at).not.toBeNull();

    const edicion = await request(app)
      .patch(`/api/invoices/${invoice.id}`)
      .set(auth(adminToken))
      .send({ notes: 'no debería' });
    expect(edicion.status).toBe(409);

    const pago = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ invoice_id: invoice.id, amount: 1000 });
    expect(pago.status).toBe(409);
  });

  it('las transiciones de una cotización son estrictas y el rechazo guarda su motivo', async () => {
    const quote = await nuevaCotizacion(400_000);

    const saltoIndebido = await request(app)
      .post(`/api/quotes/${quote.id}/convert`)
      .set(auth(adminToken));
    expect(saltoIndebido.status, 'una cotización en borrador no se convierte').toBe(409);

    const rechazoSinMotivo = await request(app)
      .post(`/api/quotes/${quote.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'REJECTED' });
    expect(rechazoSinMotivo.status).toBe(400);

    const rechazada = await request(app)
      .post(`/api/quotes/${quote.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'REJECTED', notes: 'El cliente escogió otro proveedor' });
    expect(rechazada.status).toBe(200);
    expect(rechazada.body.status).toBe('REJECTED');
    expect(rechazada.body.decision_reason).toBe('El cliente escogió otro proveedor');

    const reviviendo = await request(app)
      .post(`/api/quotes/${quote.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'ACCEPTED' });
    expect(reviviendo.status).toBe(409);

    // Nada se borra: la cotización rechazada sigue consultable.
    const sigue = await request(app).get(`/api/quotes/${quote.id}`).set(auth(adminToken));
    expect(sigue.status).toBe(200);
    expect(sigue.body.status).toBe('REJECTED');
  });

  // ── Licencias ─────────────────────────────────────────────

  it('contratar y renovar una licencia calcula la vigencia según el plan', async () => {
    const licencia = await request(app)
      .post('/api/licenses')
      .set(auth(adminToken))
      .send({ client_id: clientId, plan_code: 'ANUAL_PREMIUM', start_date: '2026-01-01' });
    expect(licencia.status).toBe(201);
    expect(licencia.body.start_date).toBe('2026-01-01');
    expect(licencia.body.end_date).toBe('2026-12-31');
    expect(Number(licencia.body.price_amount)).toBe(10_000_000);

    const renovada = await request(app).post(`/api/licenses/${licencia.body.id}/renew`).set(auth(adminToken));
    expect(renovada.status).toBe(200);
    expect(renovada.body.end_date).toBe('2027-12-31');

    const porVencer = await request(app)
      .get('/api/licenses/expiring')
      .set(auth(adminToken))
      .query({ days: 3650 });
    expect(porVencer.status).toBe(200);
    expect((porVencer.body as { id: string }[]).some((l) => l.id === licencia.body.id)).toBe(true);
  });

  it('la vista de 360° del cliente resume la relación comercial', async () => {
    const res = await request(app).get(`/api/clients/${clientId}/summary`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.client.id).toBe(clientId);
    expect(res.body.totals).toHaveProperty('invoiced');
    expect(res.body.totals).toHaveProperty('balance');
    expect(Array.isArray(res.body.last_invoices)).toBe(true);
    expect(Array.isArray(res.body.last_payments)).toBe(true);
    expect(res.body.active_license).not.toBeNull();
  });

  it('las estadísticas agregan facturación, recaudo y cartera', async () => {
    const res = await request(app).get('/api/billing/stats').set(auth(adminToken));
    expect(res.status).toBe(200);
    for (const key of ['invoiced_by_month', 'collected_by_month', 'outstanding', 'overdue', 'by_plan', 'top_clients']) {
      expect(res.body, `falta ${key}`).toHaveProperty(key);
    }
    expect(Number(res.body.outstanding)).toBeGreaterThan(0);
    expect((res.body.by_plan as { plan_code: string }[]).length).toBe(3);
  });

  it('el trabajo diario marca vencidas las facturas fuera de plazo con saldo', async () => {
    const invoice = await facturaEmitida(150_000);
    await query(`UPDATE invoices SET due_date = (now() AT TIME ZONE 'UTC')::date - 5 WHERE id = $1`, [invoice.id]);

    const run = await request(app).post('/api/system/jobs/mark_overdue_invoices/run').set(auth(adminToken));
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('OK');

    const despues = await request(app).get(`/api/invoices/${invoice.id}`).set(auth(adminToken));
    expect(despues.body.status).toBe('OVERDUE');
  });

  // ── PDF ───────────────────────────────────────────────────

  it('el PDF de la cotización se genera y no promete factura electrónica', async () => {
    const quote = await nuevaCotizacion(800_000);
    const res = await request(app)
      .get(`/api/quotes/${quote.id}/pdf`)
      .set(auth(adminToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const buffer = res.body as Buffer;
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('el PDF de la factura se genera', async () => {
    const invoice = await facturaEmitida(900_000);
    const res = await request(app)
      .get(`/api/invoices/${invoice.id}/pdf`)
      .set(auth(adminToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const buffer = res.body as Buffer;
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('ninguna respuesta comercial insinúa factura electrónica ante la DIAN', async () => {
    const invoice = await facturaEmitida(120_000);
    const detalle = await request(app).get(`/api/invoices/${invoice.id}`).set(auth(adminToken));
    expect(JSON.stringify(detalle.body)).not.toMatch(/DIAN|factura electr/i);

    const config = await one<{ value: Record<string, unknown> }>(
      `SELECT value FROM system_config WHERE key = 'billing'`,
    );
    expect(JSON.stringify(config?.value)).not.toMatch(/factura electrónica válida|habilitada ante la DIAN/i);
  });
});
