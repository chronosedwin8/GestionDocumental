import PDFDocument from 'pdfkit';

export type ActaDocument = {
  id: string;
  title: string;
  module: string;
  folio_index?: string | null;
  type?: string | null;
  s3_key: string;
  sha256?: string | null;
  created_at?: string | null;
  reason: string;
};

export type ActaInput = {
  institution: string;
  actaNumber: string;
  responsible: string;
  responsibleRole?: string | null;
  requester?: string | null;
  legalBasis?: string;
  documents: ActaDocument[];
};

const FORMAT = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });

/** Genera el acta de eliminación documental (Ley 594/2000, Acuerdo AGN 004/2019). */
export function buildActaPdf(input: ActaInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('ACTA DE ELIMINACIÓN DOCUMENTAL', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).text(input.institution, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Acta N.º: ${input.actaNumber}`);
    doc.text(`Fecha: ${FORMAT.format(new Date())}`);
    doc.text(`Responsable: ${input.responsible}${input.responsibleRole ? ` (${input.responsibleRole})` : ''}`);
    if (input.requester) doc.text(`Solicitante original: ${input.requester}`);
    doc.moveDown(0.6);

    doc.text(
      input.legalBasis ??
        'Fundamento: Ley 594 de 2000, Acuerdo AGN 004 de 2019 y la Tabla de Retención Documental vigente de la institución. ' +
          'Cumplido el tiempo de retención y la disposición final establecida, se procede con la eliminación de los documentos relacionados.',
      { align: 'justify' },
    );
    doc.moveDown(1);

    doc.fontSize(12).text('Documentos eliminados', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);

    input.documents.forEach((item, index) => {
      doc.text(`${index + 1}. ${item.title}`);
      doc.text(`   Identificador: ${item.id}`);
      doc.text(`   Módulo: ${item.module}${item.type ? ` · Tipo: ${item.type}` : ''}`);
      doc.text(`   Folio: ${item.folio_index ?? 'sin folio'}`);
      doc.text(`   Clave de almacenamiento: ${item.s3_key}`);
      doc.text(`   SHA-256: ${item.sha256 ?? 'no registrado'}`);
      if (item.created_at) doc.text(`   Creado: ${FORMAT.format(new Date(item.created_at))}`);
      doc.text(`   Motivo: ${item.reason}`);
      doc.moveDown(0.5);
      if (doc.y > 680) doc.addPage();
    });

    doc.moveDown(1.5);
    doc.fontSize(10);
    doc.text('_________________________________________');
    doc.text(input.responsible);
    doc.text(input.responsibleRole ?? 'Responsable de la eliminación');
    doc.moveDown(0.8);
    doc.fontSize(8).text(
      'Documento generado automáticamente por EduArchive SGDEA. La eliminación queda registrada en los ' +
        'registros de eliminación y en la cadena de custodia del sistema.',
      { align: 'justify' },
    );

    doc.end();
  });
}
