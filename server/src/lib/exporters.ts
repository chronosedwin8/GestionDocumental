import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ExportColumn = { key: string; label: string };

function toRows(columns: ExportColumn[], data: Record<string, unknown>[]): unknown[][] {
  return data.map((row) =>
    columns.map((col) => {
      const value = row[col.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    }),
  );
}

export function toXlsx(columns: ExportColumn[], data: Record<string, unknown>[], sheetName = 'Datos'): Buffer {
  const aoa = [columns.map((c) => c.label), ...toRows(columns, data)];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function toCsv(columns: ExportColumn[], data: Record<string, unknown>[]): Buffer {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map((c) => escape(c.label)).join(';'),
    ...toRows(columns, data).map((row) => row.map(escape).join(';')),
  ];
  // BOM para que Excel en Windows reconozca UTF-8.
  return Buffer.from(`﻿${lines.join('\r\n')}`, 'utf8');
}

export function toPdfTable(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  data: Record<string, unknown>[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(14).text(title, { align: 'center' });
    if (subtitle) doc.fontSize(9).text(subtitle, { align: 'center' });
    doc.moveDown(0.8);

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / columns.length;

    const writeRow = (values: string[], bold: boolean): void => {
      const y = doc.y;
      doc.fontSize(bold ? 8.5 : 8);
      values.forEach((value, index) => {
        doc.text(value, doc.page.margins.left + index * colWidth, y, {
          width: colWidth - 4,
          height: 24,
          ellipsis: true,
        });
      });
      doc.moveDown(0.2);
      doc.y = y + 16;
      if (doc.y > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
    };

    writeRow(columns.map((c) => c.label), true);
    for (const row of toRows(columns, data)) {
      writeRow(row.map((value) => String(value ?? '')), false);
    }

    doc.end();
  });
}

export async function buildExport(
  format: ExportFormat,
  options: { title: string; subtitle?: string; columns: ExportColumn[]; data: Record<string, unknown>[] },
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (format === 'xlsx') {
    return {
      buffer: toXlsx(options.columns, options.data, options.title),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }
  if (format === 'pdf') {
    return {
      buffer: await toPdfTable(options.title, options.subtitle ?? '', options.columns, options.data),
      contentType: 'application/pdf',
      extension: 'pdf',
    };
  }
  return { buffer: toCsv(options.columns, options.data), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
}
