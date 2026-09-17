import { describe, expect, it } from 'vitest';
import { validateFiles } from '@/components/ui/FileDropzone';

/**
 * La validación de la carga usa exclusivamente `settings` del catálogo del
 * servidor: ni el tamaño máximo ni los tipos MIME están escritos en el cliente.
 */
const SETTINGS = {
  max_file_size_mb: 2,
  allowed_mime_types: {
    'application/pdf': ['.pdf'],
    'image/png': ['.png'],
  } as Record<string, string[]>,
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('UploadWizard · validación de archivos', () => {
  it('acepta archivos dentro del límite y con MIME permitido', () => {
    const result = validateFiles(
      [makeFile('acta.pdf', 'application/pdf', 1024 * 1024)],
      SETTINGS.allowed_mime_types,
      SETTINGS.max_file_size_mb,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('rechaza archivos que superan el tamaño máximo del catálogo', () => {
    const result = validateFiles(
      [makeFile('grande.pdf', 'application/pdf', 5 * 1024 * 1024)],
      SETTINGS.allowed_mime_types,
      SETTINGS.max_file_size_mb,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain('2 MB');
  });

  it('rechaza tipos MIME que no están en el catálogo', () => {
    const result = validateFiles(
      [makeFile('script.exe', 'application/x-msdownload', 1024)],
      SETTINGS.allowed_mime_types,
      SETTINGS.max_file_size_mb,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toContain('no permitido');
  });

  it('acepta por extensión cuando el navegador no informa el MIME', () => {
    const result = validateFiles(
      [makeFile('informe.PDF', '', 1024)],
      SETTINGS.allowed_mime_types,
      SETTINGS.max_file_size_mb,
    );

    expect(result.accepted).toHaveLength(1);
  });

  it('separa aceptados y rechazados en una carga múltiple', () => {
    const result = validateFiles(
      [
        makeFile('ok.png', 'image/png', 1024),
        makeFile('pesado.pdf', 'application/pdf', 10 * 1024 * 1024),
        makeFile('malo.zip', 'application/zip', 1024),
      ],
      SETTINGS.allowed_mime_types,
      SETTINGS.max_file_size_mb,
    );

    expect(result.accepted.map((file) => file.name)).toEqual(['ok.png']);
    expect(result.rejected.map((entry) => entry.file.name)).toEqual(['pesado.pdf', 'malo.zip']);
  });

  it('acepta cualquier tipo si el catálogo no restringe MIME', () => {
    const result = validateFiles([makeFile('raro.xyz', 'application/octet-stream', 1024)], {}, 10);
    expect(result.accepted).toHaveLength(1);
  });
});
