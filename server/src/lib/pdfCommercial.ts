import PDFDocument from 'pdfkit';

/**
 * PDF de cotización y de factura.
 *
 * Se apoya en la misma librería (`pdfkit`) y en el mismo estilo sobrio que el
 * acta de eliminación (`pdfActa.ts`): página LETTER, márgenes de 50 y ninguna
 * dependencia externa.
 *
 * **Sin promesas normativas**: el pie deja claro que el documento NO es una
 * factura electrónica válida ante la DIAN. Ese texto no es configurable.
 */

export type CommercialParty = {
  name: string;
  legal_name?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type CommercialLine = {
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type CommercialDocumentInput = {
  kind: 'QUOTE' | 'INVOICE';
  number: string;
  status: string;
  issue_date: string;
  /** `valid_until` en una cotización, `due_date` en una factura. */
  second_date?: string | null;
  currency: string;
  tax_name: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount?: number | null;
  balance?: number | null;
  issuer: CommercialParty;
  client: CommercialParty;
  lines: CommercialLine[];
  notes?: string | null;
  terms?: string | null;
  bank_details?: string | null;
  void_reason?: string | null;
};

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' });

/** Importe en pesos colombianos con separador de miles y dos decimales. */
export function formatAmount(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
  return `${currency} ${formatted}`;
}

/** Una fecha civil `YYYY-MM-DD` se muestra sin desplazarla de día. */
function formatCivilDate(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return String(value);
  return DATE_FORMAT.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function partyBlock(doc: PDFKit.PDFDocument, title: string, party: CommercialParty, x: number, width: number): void {
  const top = doc.y;
  doc.fontSize(8).fillColor('#64748b').text(title, x, top, { width });
  doc.fillColor('#000000').fontSize(10).text(party.legal_name || party.name, x, doc.y, { width });
  doc.fontSize(9);
  if (party.document_number) {
    doc.text(`${party.document_type ?? 'NIT'}: ${party.document_number}`, x, doc.y, { width });
  }
  if (party.address) doc.text(party.address, x, doc.y, { width });
  if (party.city) doc.text([party.city, party.country].filter(Boolean).join(', '), x, doc.y, { width });
  if (party.email) doc.text(party.email, x, doc.y, { width });
  if (party.phone) doc.text(party.phone, x, doc.y, { width });
}

const TITLES: Record<CommercialDocumentInput['kind'], string> = {
  QUOTE: 'COTIZACIÓN',
  INVOICE: 'CUENTA DE COBRO',
};

export function buildCommercialPdf(input: CommercialDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // Encabezado
    doc.fontSize(16).text(TITLES[input.kind], { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).text(input.issuer.name, { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10);
    doc.text(`N.º: ${input.number}`, left, doc.y, { width: contentWidth / 2, continued: false });
    const headerTop = doc.y;
    doc.text(`Estado: ${input.status}`, left, headerTop);
    doc.text(`Fecha de emisión: ${formatCivilDate(input.issue_date)}`, left, doc.y);
    doc.text(
      input.kind === 'QUOTE'
        ? `Válida hasta: ${formatCivilDate(input.second_date)}`
        : `Vence: ${formatCivilDate(input.second_date)}`,
      left,
      doc.y,
    );
    doc.moveDown(0.8);

    // Emisor y cliente, en dos columnas
    const columnsTop = doc.y;
    const columnWidth = contentWidth / 2 - 10;
    partyBlock(doc, 'EMISOR', input.issuer, left, columnWidth);
    const issuerBottom = doc.y;
    doc.y = columnsTop;
    partyBlock(doc, 'CLIENTE', input.client, left + contentWidth / 2 + 10, columnWidth);
    doc.y = Math.max(issuerBottom, doc.y);
    doc.moveDown(1);

    // Tabla de líneas
    const colDescription = left;
    const colQuantity = left + contentWidth * 0.56;
    const colUnit = left + contentWidth * 0.68;
    const colTotal = left + contentWidth * 0.84;

    doc.fontSize(9).fillColor('#64748b');
    const tableTop = doc.y;
    doc.text('Descripción', colDescription, tableTop, { width: contentWidth * 0.54 });
    doc.text('Cant.', colQuantity, tableTop, { width: contentWidth * 0.1, align: 'right' });
    doc.text('Precio', colUnit, tableTop, { width: contentWidth * 0.14, align: 'right' });
    doc.text('Total', colTotal, tableTop, { width: contentWidth * 0.16, align: 'right' });
    doc.moveDown(0.3);
    doc
      .strokeColor('#cbd5e1')
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke();
    doc.moveDown(0.4);
    doc.fillColor('#000000');

    for (const line of input.lines) {
      if (doc.y > 640) doc.addPage();
      const rowTop = doc.y;
      doc.fontSize(9).text(`${line.position}. ${line.description}`, colDescription, rowTop, {
        width: contentWidth * 0.54,
      });
      const rowBottom = doc.y;
      doc.text(String(line.quantity), colQuantity, rowTop, { width: contentWidth * 0.1, align: 'right' });
      doc.text(formatAmount(line.unit_price, input.currency), colUnit, rowTop, {
        width: contentWidth * 0.14,
        align: 'right',
      });
      doc.text(formatAmount(line.total, input.currency), colTotal, rowTop, {
        width: contentWidth * 0.16,
        align: 'right',
      });
      doc.y = Math.max(rowBottom, doc.y);
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);
    doc.strokeColor('#cbd5e1').moveTo(colQuantity, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.4);

    const totalsLabelX = colQuantity;
    const totalsLabelWidth = contentWidth * 0.24;
    const totalsValueX = colTotal;
    const totalsValueWidth = contentWidth * 0.16;

    const totalsRow = (label: string, value: string, bold = false): void => {
      const top = doc.y;
      doc.fontSize(bold ? 11 : 9);
      doc.text(label, totalsLabelX, top, { width: totalsLabelWidth, align: 'right' });
      doc.text(value, totalsValueX, top, { width: totalsValueWidth, align: 'right' });
      doc.moveDown(0.3);
    };

    totalsRow('Subtotal', formatAmount(input.subtotal, input.currency));
    totalsRow(`${input.tax_name} (${input.tax_rate}%)`, formatAmount(input.tax_amount, input.currency));
    totalsRow('Total', formatAmount(input.total, input.currency), true);
    if (input.kind === 'INVOICE') {
      totalsRow('Pagado', formatAmount(Number(input.paid_amount ?? 0), input.currency));
      totalsRow('Saldo', formatAmount(Number(input.balance ?? 0), input.currency), true);
    }

    doc.moveDown(1);
    doc.fontSize(9).fillColor('#000000');
    if (input.void_reason) {
      doc.fontSize(10).fillColor('#b91c1c').text(`DOCUMENTO ANULADO. Motivo: ${input.void_reason}`, left, doc.y, {
        width: contentWidth,
      });
      doc.fillColor('#000000').fontSize(9);
      doc.moveDown(0.6);
    }
    if (input.notes) {
      doc.text(`Observaciones: ${input.notes}`, left, doc.y, { width: contentWidth, align: 'justify' });
      doc.moveDown(0.4);
    }
    if (input.terms) {
      doc.text(input.terms, left, doc.y, { width: contentWidth, align: 'justify' });
      doc.moveDown(0.4);
    }
    if (input.bank_details) {
      doc.text(`Datos de pago: ${input.bank_details}`, left, doc.y, { width: contentWidth });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#475569').text(
      'Documento generado por EduArchive SGDEA. Este documento NO es una factura electrónica ' +
        'ante la DIAN ni tiene efectos tributarios: es un documento comercial interno de registro y cobro.',
      left,
      doc.y,
      { width: contentWidth, align: 'justify' },
    );

    doc.end();
  });
}
