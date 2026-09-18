import { useState } from 'react';
import { Check, Fingerprint, Pencil, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as aiApi from '@/api/ai';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { AiStatusIndicator } from '@/components/ai/AiStatusIndicator';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { formatBytes, formatDate, formatDateTime } from '@/lib/format';
import { OcrNotice } from './OcrNotice';
import type { ApiDocument } from '@/types/api';

export interface InfoTabProps {
  document: ApiDocument;
  canWrite: boolean;
  onUpdated: (document: ApiDocument) => void;
  /** Vuelve a pedir el documento al servidor (tras reconocer texto, p. ej.). */
  onRefresh?: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-content-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-content-secondary">{children}</dd>
    </div>
  );
}

export function InfoTab({ document, canWrite, onUpdated, onRefresh }: InfoTabProps): React.JSX.Element {
  const { statusLabel, statusColor, moduleLabel, moduleColor, settings } = useCatalogs();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(document.title);
  const [summary, setSummary] = useState(document.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const allowsEdit = canWrite;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const updated = await documentsApi.updateDocument(document.id, {
        title: title.trim(),
        summary: summary.trim() || null,
      });
      onUpdated(updated);
      setEditing(false);
      toast.success('Documento actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const addTag = async (): Promise<void> => {
    const tag = tagInput.trim();
    if (!tag) return;
    try {
      const tags = await documentsApi.addTags(document.id, [tag]);
      onUpdated({ ...document, tags });
      setTagInput('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo añadir la etiqueta.');
    }
  };

  const removeTag = async (tag: string): Promise<void> => {
    try {
      const tags = await documentsApi.removeTag(document.id, tag);
      onUpdated({ ...document, tags });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar la etiqueta.');
    }
  };

  const regenerate = async (): Promise<void> => {
    setAnalyzing(true);
    try {
      const result = await aiApi.analyze(document.id);
      onUpdated({ ...document, summary: result.summary, tags: result.tags, ai_status: 'DONE' });
      toast.success('Resumen y etiquetas regenerados.');
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED'
          ? 'El asistente de IA no está configurado en el servidor.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo analizar el documento.',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  /** Reintento del análisis fallido/pendiente (`POST /documents/:id/ai/analyze`). */
  const retryAnalysis = async (): Promise<void> => {
    setRetrying(true);
    try {
      const result = await documentsApi.reanalyze(document.id);
      onUpdated({
        ...document,
        ai_status: result.ai_status,
        ai_error: result.ai_status === 'FAILED' ? document.ai_error : null,
        ...(result.summary !== undefined ? { summary: result.summary } : {}),
        ...(result.tags !== undefined ? { tags: result.tags } : {}),
      });
      toast.success(
        result.ai_status === 'PENDING' ? 'Análisis reencolado.' : 'Análisis actualizado.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo reintentar el análisis.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-5">
      <OcrNotice
        document={document}
        canWrite={canWrite}
        onRecognized={() => onRefresh?.()}
      />

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-sm text-content-primary">Identificación</h3>
          {allowsEdit && !editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} icon={<Pencil className="h-3.5 w-3.5" />}>
              Editar
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <FormField label="Título" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="Resumen">
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
            </FormField>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
                Guardar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setTitle(document.title);
                  setSummary(document.summary ?? '');
                  setEditing(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Título">{document.title}</Field>
            <Field label="Tipo documental">{document.type}</Field>
            <Field label="Dependencia">
              <Badge color={moduleColor(document.module_code)}>{moduleLabel(document.module_code)}</Badge>
            </Field>
            <Field label="Estado">
              <Badge color={statusColor(document.status_code)}>{statusLabel(document.status_code)}</Badge>
            </Field>
            <Field label="Folio">
              {document.folio_index ? (
                <span className="font-mono">{document.folio_index}</span>
              ) : (
                <Badge color="var(--color-warning)">Sin foliar</Badge>
              )}
            </Field>
            <Field label="Autor">{document.author?.full_name ?? '—'}</Field>
            <Field label="Serie">{document.category ?? '—'}</Field>
            <Field label="Subserie">{document.subcategory ?? '—'}</Field>
            <Field label="Creado">{formatDateTime(document.created_at)}</Field>
            <Field label="Actualizado">{formatDateTime(document.updated_at)}</Field>
          </dl>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display text-sm text-content-primary">Resumen</h3>
          {settings?.ai_enabled && allowsEdit && (
            <Button
              size="sm"
              variant="ghost"
              loading={analyzing}
              onClick={() => void regenerate()}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              Regenerar con IA
            </Button>
          )}
        </div>
        <AiStatusIndicator
          variant="block"
          status={document.ai_status}
          error={document.ai_error ?? null}
          retrying={retrying}
          {...(allowsEdit && settings?.ai_enabled !== false
            ? { onRetry: () => void retryAnalysis() }
            : {})}
        />

        {document.summary ? (
          <p className="mt-2 whitespace-pre-line text-sm text-content-secondary">{document.summary}</p>
        ) : (
          document.ai_status === 'DONE' && (
            <p className="text-sm text-content-muted">Este documento no tiene resumen.</p>
          )
        )}
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm text-content-primary">Etiquetas</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {document.tags.length === 0 && <span className="text-sm text-content-muted">Sin etiquetas.</span>}
          {document.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-overlay px-2 py-0.5 text-[11px] text-content-secondary"
            >
              {tag}
              {allowsEdit && (
                <button
                  type="button"
                  aria-label={`Quitar etiqueta ${tag}`}
                  onClick={() => void removeTag(tag)}
                  className="text-content-muted hover:text-state-danger"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
        {allowsEdit && (
          <div className="mt-2 flex gap-2">
            <Input
              className="max-w-xs"
              placeholder="Nueva etiqueta"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTag();
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => void addTag()} icon={<Check className="h-3.5 w-3.5" />}>
              Añadir
            </Button>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm text-content-primary">Archivo</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Nombre">{document.file_name}</Field>
          <Field label="Tipo MIME">{document.file_type || '—'}</Field>
          <Field label="Tamaño">{formatBytes(document.file_size)}</Field>
          <Field label="Páginas">{document.page_count ?? '—'}</Field>
          <Field label="Retención hasta">{formatDate(document.retention_end_date)}</Field>
          <Field label="SHA-256">
            {document.sha256 ? (
              <span className="inline-flex items-start gap-1 break-all font-mono text-[11px]">
                <Fingerprint className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                {document.sha256}
              </span>
            ) : (
              '—'
            )}
          </Field>
        </dl>
      </section>
    </div>
  );
}
