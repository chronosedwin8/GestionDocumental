import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Fingerprint,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as categoriesApi from '@/api/categories';
import * as documentsApi from '@/api/documents';
import * as trdApi from '@/api/trd';
import { ApiError, sha256File } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useAiConfidenceThreshold } from '@/hooks/useAiHealth';
import { useQuery } from '@/hooks/useQuery';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FileDropzone, validateFiles } from '@/components/ui/FileDropzone';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { formatBytes } from '@/lib/format';
import { AiClassificationPanel } from './AiClassificationPanel';
import type { ApiDocument } from '@/types/api';
import type { UploadItem } from '@/types/ui';

export interface UploadWizardProps {
  open: boolean;
  moduleCode: string;
  onClose: () => void;
  onUploaded: (documents: ApiDocument[]) => void;
}

type Step = 'files' | 'classify' | 'confirm';

const STEPS: { id: Step; label: string }[] = [
  { id: 'files', label: '1. Archivos' },
  { id: 'classify', label: '2. Clasificación' },
  { id: 'confirm', label: '3. Confirmación' },
];

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Asistente de carga en 3 pasos (U4/F8):
 *  1. Archivos validados contra `settings` y con SHA-256 calculado en cliente.
 *  2. Clasificación TRD/serie/subserie obligatoria antes de subir.
 *  3. Confirmación con progreso real por archivo (XHR) y reintento individual.
 */
export function UploadWizard({
  open,
  moduleCode,
  onClose,
  onUploaded,
}: UploadWizardProps): React.JSX.Element {
  const { settings, moduleLabel } = useCatalogs();
  const aiThreshold = useAiConfidenceThreshold();
  const [step, setStep] = useState<Step>('files');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const abortRefs = useRef(new Map<string, () => void>());

  const rules = useQuery(`trd:${moduleCode}`, (signal) => trdApi.listRules(moduleCode, signal), {
    enabled: open,
  });
  const categories = useQuery(
    `categories:${moduleCode}`,
    (signal) => categoriesApi.listCategories(moduleCode, false, signal),
    { enabled: open },
  );

  const requireTrd = settings?.require_trd !== false;
  const maxFileSizeMb = settings?.max_file_size_mb ?? 50;
  const allowedMimeTypes = settings?.allowed_mime_types ?? {};

  const typeOptions = useMemo(
    () =>
      (rules.data ?? []).map((rule) => ({
        value: rule.document_type,
        label: `${rule.document_type} · ${rule.retention_years} año(s)`,
      })),
    [rules.data],
  );

  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((cat) => ({ value: cat.name, label: cat.name })),
    [categories.data],
  );

  /** Valores reales del catálogo: la IA no puede proponer nada fuera de ellos. */
  const typeValues = useMemo(
    () => (rules.data ?? []).map((rule) => rule.document_type),
    [rules.data],
  );
  const serieValues = useMemo(
    () => (categories.data ?? []).map((cat) => cat.name),
    [categories.data],
  );
  const subserieValues = useMemo(
    () => (categories.data ?? []).flatMap((cat) => (cat.subcategories ?? []).map((sub) => sub.name)),
    [categories.data],
  );

  const subcategoryOptionsFor = useCallback(
    (categoryName: string) => {
      const parent = (categories.data ?? []).find((cat) => cat.name === categoryName);
      return (parent?.subcategories ?? []).map((sub) => ({ value: sub.name, label: sub.name }));
    },
    [categories.data],
  );

  const reset = useCallback(() => {
    abortRefs.current.forEach((abort) => abort());
    abortRefs.current.clear();
    setItems([]);
    setRejected([]);
    setStep('files');
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, reset, onClose]);

  /* --------------------------------------------------- paso 1: archivos */

  const addFiles = useCallback(
    async (accepted: File[], rejectedFiles: { file: File; reason: string }[]) => {
      setRejected((prev) => [
        ...prev,
        ...rejectedFiles.map((entry) => ({ name: entry.file.name, reason: entry.reason })),
      ]);

      const created: UploadItem[] = accepted.map((file) => ({
        id: newId(),
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        type: '',
        category: '',
        subcategory: '',
        tags: [],
        sha256: null,
        progress: 0,
        status: 'hashing',
        error: null,
        documentId: null,
      }));

      setItems((prev) => [...prev, ...created]);

      // SHA-256 en el navegador (Web Crypto): el servidor lo verifica.
      for (const item of created) {
        try {
          const hash = await sha256File(item.file);
          setItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, sha256: hash, status: 'pending' } : entry)),
          );
        } catch {
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: 'pending', error: 'No se pudo calcular el hash local.' }
                : entry,
            ),
          );
        }
      }
    },
    [],
  );

  const removeItem = (id: string): void => {
    abortRefs.current.get(id)?.();
    abortRefs.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, patch: Partial<UploadItem>): void => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  /**
   * Aplica una sugerencia de la IA que una persona acaba de confirmar. Al
   * aceptar una subserie se completa también su serie padre, porque el
   * formulario no admite subserie sin serie.
   */
  const acceptSuggestion = (
    id: string,
    field: 'type' | 'category' | 'subcategory',
    value: string,
  ): void => {
    if (field === 'type') {
      updateItem(id, { type: value });
      return;
    }
    if (field === 'category') {
      updateItem(id, { category: value, subcategory: '' });
      return;
    }
    const parent = (categories.data ?? []).find((cat) =>
      (cat.subcategories ?? []).some((sub) => sub.name === value),
    );
    updateItem(id, { subcategory: value, ...(parent ? { category: parent.name } : {}) });
  };

  /** Aplica tipo/categoría a todos los archivos de golpe. */
  const applyToAll = (patch: Partial<UploadItem>): void => {
    setItems((prev) => prev.map((item) => ({ ...item, ...patch })));
  };

  /* --------------------------------------------------- paso 3: subida */

  const uploadOne = useCallback(
    async (item: UploadItem): Promise<ApiDocument | null> => {
      updateItem(item.id, { status: 'uploading', progress: 0, error: null });

      const handle = documentsApi.uploadDocument(
        {
          file: item.file,
          module_code: moduleCode,
          type: item.type,
          title: item.title.trim() || item.file.name,
          ...(item.category ? { category: item.category } : {}),
          ...(item.subcategory ? { subcategory: item.subcategory } : {}),
          ...(item.tags.length ? { tags: item.tags } : {}),
          ...(item.sha256 ? { client_sha256: item.sha256 } : {}),
        },
        (progress) => updateItem(item.id, { progress: progress.percent }),
      );

      abortRefs.current.set(item.id, handle.abort);

      try {
        const document = await handle.promise;
        updateItem(item.id, { status: 'done', progress: 100, documentId: document.id });
        return document;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.code === 'HASH_MISMATCH'
              ? 'El archivo cambió durante la subida (hash distinto). Reintenta.'
              : err.code === 'STORAGE_NOT_CONFIGURED'
                ? 'El almacenamiento no está configurado en el servidor.'
                : err.message
            : 'Error inesperado al subir.';
        updateItem(item.id, { status: 'error', error: message });
        return null;
      } finally {
        abortRefs.current.delete(item.id);
      }
    },
    [moduleCode],
  );

  const startUpload = useCallback(async (): Promise<void> => {
    setUploading(true);
    const pending = items.filter((item) => item.status !== 'done');
    const uploaded: ApiDocument[] = [];

    for (const item of pending) {
      const result = await uploadOne(item);
      if (result) uploaded.push(result);
    }

    setUploading(false);

    if (uploaded.length > 0) {
      onUploaded(uploaded);
      toast.success(
        `${uploaded.length} documento${uploaded.length === 1 ? '' : 's'} cargado${uploaded.length === 1 ? '' : 's'}.`,
      );
    }
    if (uploaded.length === pending.length && pending.length > 0) {
      reset();
      onClose();
    }
  }, [items, uploadOne, onUploaded, reset, onClose]);

  const retryOne = useCallback(
    async (item: UploadItem): Promise<void> => {
      setUploading(true);
      const result = await uploadOne(item);
      setUploading(false);
      if (result) onUploaded([result]);
    },
    [uploadOne, onUploaded],
  );

  /* ------------------------------------------------------- validación */

  const classificationComplete = items.length > 0 && items.every((item) => !requireTrd || item.type !== '');
  const canGoToClassify = items.length > 0 && items.every((item) => item.status !== 'hashing');

  const footer = (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={uploading}>
        {items.some((item) => item.status === 'done') ? 'Cerrar' : 'Cancelar'}
      </Button>
      {step !== 'files' && (
        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => setStep(step === 'confirm' ? 'classify' : 'files')}
        >
          Atrás
        </Button>
      )}
      {step === 'files' && (
        <Button variant="primary" disabled={!canGoToClassify} onClick={() => setStep('classify')}>
          Continuar
        </Button>
      )}
      {step === 'classify' && (
        <Button variant="primary" disabled={!classificationComplete} onClick={() => setStep('confirm')}>
          Revisar y subir
        </Button>
      )}
      {step === 'confirm' && (
        <Button
          variant="primary"
          loading={uploading}
          disabled={items.length === 0 || items.every((item) => item.status === 'done')}
          onClick={() => void startUpload()}
        >
          Subir {items.filter((item) => item.status !== 'done').length} archivo(s)
        </Button>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissable={!uploading}
      title={`Cargar documentos · ${moduleLabel(moduleCode)}`}
      description="Los archivos se clasifican según la TRD antes de almacenarse."
      size="lg"
      footer={footer}
    >
      <Tabs
        items={STEPS.map((entry) => ({
          id: entry.id,
          label: entry.label,
          disabled:
            (entry.id !== 'files' && items.length === 0) ||
            (entry.id === 'confirm' && !classificationComplete),
        }))}
        value={step}
        onChange={(id) => setStep(id as Step)}
        ariaLabel="Pasos de la carga"
        className="mb-4"
      />

      {/* ----------------------------------------------------- paso 1 */}
      {step === 'files' && (
        <div className="space-y-4">
          {!settings?.storage_configured && (
            <div className="flex items-start gap-2 rounded-lg border border-state-warning/40 bg-state-warning/10 p-3 text-xs text-state-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>
                El almacenamiento del servidor no está configurado: la subida será rechazada hasta que un
                administrador lo habilite.
              </span>
            </div>
          )}

          <FileDropzone
            onFiles={(result) => void addFiles(result.accepted, result.rejected)}
            allowedMimeTypes={allowedMimeTypes}
            maxFileSizeMb={maxFileSizeMb}
            allowCapture
          />

          {rejected.length > 0 && (
            <ul className="space-y-1">
              {rejected.map((entry, index) => (
                <li
                  key={`${entry.name}-${index}`}
                  className="flex items-start gap-2 rounded-lg border border-state-danger/40 bg-state-danger/10 px-3 py-2 text-xs text-state-danger"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                  <span>
                    <strong>{entry.name}</strong>: {entry.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2"
                >
                  <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-content-primary">{item.file.name}</p>
                    <p className="flex items-center gap-2 text-[11px] text-content-muted">
                      {formatBytes(item.file.size)}
                      {item.status === 'hashing' && <span>· calculando SHA-256…</span>}
                      {item.sha256 && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Fingerprint className="h-3 w-3" aria-hidden />
                          {item.sha256.slice(0, 12)}…
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar ${item.file.name}`}
                    onClick={() => removeItem(item.id)}
                    icon={<X className="h-4 w-4" />}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ----------------------------------------------------- paso 2 */}
      {step === 'classify' && (
        <div className="space-y-4">
          {requireTrd && typeOptions.length === 0 && !rules.loading && (
            <div className="flex items-start gap-2 rounded-lg border border-state-warning/40 bg-state-warning/10 p-3 text-xs text-state-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>
                Esta dependencia no tiene tipos documentales en la TRD. Un administrador o archivista debe
                crearlos antes de cargar documentos.
              </span>
            </div>
          )}

          {items.length > 1 && typeOptions.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <p className="mb-2 text-xs font-medium text-content-secondary">Aplicar a todos</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  aria-label="Tipo documental para todos"
                  placeholder="Tipo documental (TRD)"
                  options={typeOptions}
                  onChange={(e) => applyToAll({ type: e.target.value })}
                />
                <Select
                  aria-label="Serie para todos"
                  placeholder="Serie / categoría"
                  options={categoryOptions}
                  onChange={(e) => applyToAll({ category: e.target.value, subcategory: '' })}
                />
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-card border border-line bg-surface-sunken p-3">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-sm text-content-primary">{item.file.name}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar ${item.file.name}`}
                    onClick={() => removeItem(item.id)}
                    icon={<Trash2 className="h-4 w-4" />}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormField label="Título">
                    <Input
                      value={item.title}
                      onChange={(e) => updateItem(item.id, { title: e.target.value })}
                    />
                  </FormField>
                  <FormField
                    label="Tipo documental (TRD)"
                    required={requireTrd}
                    error={requireTrd && item.type === '' ? 'Selecciona un tipo documental.' : null}
                  >
                    <Select
                      placeholder="Selecciona…"
                      options={typeOptions}
                      value={item.type}
                      onChange={(e) => updateItem(item.id, { type: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Serie / categoría">
                    <Select
                      placeholder="Sin categoría"
                      options={categoryOptions}
                      value={item.category}
                      onChange={(e) => updateItem(item.id, { category: e.target.value, subcategory: '' })}
                    />
                  </FormField>
                  <FormField label="Subserie">
                    <Select
                      placeholder="Sin subserie"
                      options={subcategoryOptionsFor(item.category)}
                      value={item.subcategory}
                      disabled={item.category === ''}
                      onChange={(e) => updateItem(item.id, { subcategory: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Etiquetas" className="md:col-span-2" hint="Separadas por comas.">
                    <Input
                      value={item.tags.join(', ')}
                      onChange={(e) =>
                        updateItem(item.id, {
                          tags: e.target.value
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </FormField>
                </div>

                {settings?.ai_enabled !== false && (
                  <AiClassificationPanel
                    moduleCode={moduleCode}
                    file={item.file}
                    value={{
                      type: item.type,
                      category: item.category,
                      subcategory: item.subcategory,
                    }}
                    typeValues={typeValues}
                    serieValues={serieValues}
                    subserieValues={subserieValues}
                    threshold={aiThreshold}
                    disabled={uploading}
                    onAccept={(field, value) => acceptSuggestion(item.id, field, value)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ----------------------------------------------------- paso 3 */}
      {step === 'confirm' && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-line bg-surface-sunken p-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-content-primary">{item.title || item.file.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
                    <span>{formatBytes(item.file.size)}</span>
                    {item.type && <Badge>{item.type}</Badge>}
                    {item.category && <Badge>{item.category}</Badge>}
                    {item.sha256 && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Fingerprint className="h-3 w-3" aria-hidden />
                        {item.sha256.slice(0, 16)}…
                      </span>
                    )}
                  </p>
                </div>
                {item.status === 'done' && (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-state-success" aria-hidden />
                )}
                {item.status === 'error' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void retryOne(item)}
                    disabled={uploading}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                  >
                    Reintentar
                  </Button>
                )}
              </div>

              {(item.status === 'uploading' || item.status === 'done') && (
                <ProgressBar
                  className="mt-2"
                  value={item.progress}
                  tone={item.status === 'done' ? 'success' : 'default'}
                  label={`Progreso de ${item.file.name}`}
                  showValue={item.status === 'uploading'}
                />
              )}

              {item.error && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-state-danger" role="alert">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export { validateFiles };
