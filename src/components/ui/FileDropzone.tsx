import { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

export interface FileValidationResult {
  accepted: File[];
  rejected: { file: File; reason: string }[];
}

export interface FileDropzoneProps {
  onFiles: (result: FileValidationResult) => void;
  /** MIME -> extensiones, tal como llega de `settings.allowed_mime_types`. */
  allowedMimeTypes: Record<string, string[]>;
  maxFileSizeMb: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  /** Permite tomar foto en móvil (U9). */
  allowCapture?: boolean;
}

/** Valida tamaño y tipo contra el catálogo del servidor (nada hardcodeado). */
export function validateFiles(
  files: File[],
  allowedMimeTypes: Record<string, string[]>,
  maxFileSizeMb: number,
): FileValidationResult {
  const mimes = Object.keys(allowedMimeTypes);
  const extensions = Object.values(allowedMimeTypes).flat().map((ext) => ext.toLowerCase());
  const maxBytes = maxFileSizeMb * 1024 * 1024;

  const accepted: File[] = [];
  const rejected: { file: File; reason: string }[] = [];

  for (const file of files) {
    if (file.size > maxBytes) {
      rejected.push({
        file,
        reason: `Supera el límite de ${maxFileSizeMb} MB (${formatBytes(file.size)}).`,
      });
      continue;
    }
    if (mimes.length > 0) {
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
      const mimeOk = file.type !== '' && mimes.includes(file.type);
      const extOk = ext !== '' && extensions.includes(ext);
      if (!mimeOk && !extOk) {
        rejected.push({ file, reason: `Tipo de archivo no permitido (${file.type || ext || 'desconocido'}).` });
        continue;
      }
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

export function FileDropzone({
  onFiles,
  allowedMimeTypes,
  maxFileSizeMb,
  multiple = true,
  disabled = false,
  className,
  allowCapture = false,
}: FileDropzoneProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(validateFiles(Array.from(list), allowedMimeTypes, maxFileSizeMb));
    },
    [onFiles, allowedMimeTypes, maxFileSizeMb],
  );

  const accept = Object.entries(allowedMimeTypes)
    .flatMap(([mime, exts]) => [mime, ...exts])
    .join(',');

  return (
    <div
      className={cn(
        'rounded-card border-2 border-dashed p-6 text-center transition-colors',
        dragging ? 'border-acid bg-acid-soft' : 'border-line bg-surface-sunken',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        multiple={multiple}
        accept={accept || undefined}
        {...(allowCapture ? { capture: 'environment' as const } : {})}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
      <UploadCloud className="mx-auto mb-2 h-8 w-8 text-content-muted" aria-hidden />
      <p className="text-sm text-content-secondary">
        Arrastra archivos aquí o{' '}
        <button
          type="button"
          className="font-medium text-acid underline-offset-2 hover:underline"
          onClick={() => inputRef.current?.click()}
        >
          selecciónalos
        </button>
        .
      </p>
      <p className="mt-1 text-xs text-content-muted">
        Máximo {maxFileSizeMb} MB por archivo
        {Object.values(allowedMimeTypes).flat().length > 0 && (
          <> · {Array.from(new Set(Object.values(allowedMimeTypes).flat())).join(', ')}</>
        )}
      </p>
    </div>
  );
}
