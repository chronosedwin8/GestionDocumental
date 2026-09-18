import { buildZip } from './zip.js';

export type QaFile = { name: string; mime: string; buffer: Buffer };

/** PDF 1.4 válido de una página con texto real extraíble. */
export function makePdf(text = 'Acta de prueba QA del Colegio Aleman de Barranquilla.'): QaFile {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return { name: 'qa-documento.pdf', mime: 'application/pdf', buffer: Buffer.from(pdf, 'latin1') };
}

/** DOCX real (OOXML comprimido) con un párrafo de texto. */
export function makeDocx(text = 'Documento Word de prueba de la bateria QA de EduArchive.'): QaFile {
  const buffer = buildZip({
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
    '_rels/.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
    'word/_rels/document.xml.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    'word/document.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
      `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  });
  return {
    name: 'qa-documento.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  };
}

/** XLSX real (OOXML comprimido) con una hoja y una celda de texto en línea. */
export function makeXlsx(text = 'Planilla QA EduArchive'): QaFile {
  const buffer = buildZip({
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `</Types>`,
    '_rels/.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    'xl/_rels/workbook.xml.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `</Relationships>`,
    'xl/workbook.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="QA" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/worksheets/sheet1.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>${text}</t></is></c></row>` +
      `</sheetData></worksheet>`,
  });
  return {
    name: 'qa-planilla.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  };
}

export function makeTxt(text = 'Texto plano de prueba para la bateria QA de EduArchive SGDEA.'): QaFile {
  return { name: 'qa-nota.txt', mime: 'text/plain', buffer: Buffer.from(text, 'utf8') };
}

export function makeCsv(): QaFile {
  const csv = 'codigo,nombre,valor\n1,Acta QA,100\n2,Informe QA,200\n';
  return { name: 'qa-datos.csv', mime: 'text/csv', buffer: Buffer.from(csv, 'utf8') };
}

export function makeExe(): QaFile {
  return { name: 'qa-malicioso.exe', mime: 'application/x-msdownload', buffer: Buffer.from('MZ\x90\x00QA', 'latin1') };
}

export function allFiles(): QaFile[] {
  return [makePdf(), makeDocx(), makeXlsx(), makeTxt(), makeCsv()];
}

export function toFormData(file: QaFile, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(file.buffer)], { type: file.mime }), file.name);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
