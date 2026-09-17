import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Lock,
  MailCheck,
  Plus,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as expedientesApi from '@/api/expedientes';
import * as searchApi from '@/api/search';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useDebounce } from '@/hooks/useDebounce';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { formatBytes, formatDate, formatDateTime } from '@/lib/format';

const ESTADO_COLORS: Record<string, string> = {
  ABIERTO: 'var(--color-success)',
  CERRADO: 'var(--color-warning)',
  TRANSFERIDO: 'var(--color-info)',
};

export default function ExpedienteDetail(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { moduleLabel, moduleColor, statusLabel, statusColor, correspondenceType } = useCatalogs();
  const { canWrite, hasFullAccess } = useAuth();
  const { confirm } = useDialogs();

  const expediente = useQuery(`expediente:${id}`, (signal) => expedientesApi.getExpediente(id, signal));
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 400);
  const [busy, setBusy] = useState(false);

  const candidates = useQuery(
    adding && debounced.trim().length >= 2 ? `search:expediente-add:${debounced}` : null,
    (signal) => searchApi.fulltext({ q: debounced.trim(), pageSize: 10 }, signal),
  );

  if (expediente.error) {
    return <ApiErrorState error={expediente.error} onRetry={() => void expediente.refetch()} />;
  }
  if (expediente.loading || !expediente.data) return <FullPageSpinner label="Cargando expediente…" />;

  const data = expediente.data;
  const writable = canWrite(data.module_code) && data.estado === 'ABIERTO';

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await action();
      invalidatePrefix('expedientes:');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'La acción no se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  const close = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Cerrar expediente',
      message: 'Un expediente cerrado no admite nuevos documentos ni cambios.',
      confirmLabel: 'Cerrar expediente',
    });
    if (!ok) return;
    await run(async () => {
      expediente.setData({ ...data, ...(await expedientesApi.closeExpediente(id)) });
      toast.success('Expediente cerrado.');
    });
  };

  const reopen = async (): Promise<void> => {
    const ok = await confirm({ title: 'Reabrir expediente', confirmLabel: 'Reabrir' });
    if (!ok) return;
    await run(async () => {
      expediente.setData({ ...data, ...(await expedientesApi.reopenExpediente(id)) });
      toast.success('Expediente reabierto.');
    });
  };

  const transfer = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Transferir expediente',
      message: 'El expediente pasará a la siguiente fase del ciclo archivístico.',
      confirmLabel: 'Transferir',
    });
    if (!ok) return;
    await run(async () => {
      expediente.setData({ ...data, ...(await expedientesApi.transferExpediente(id)) });
      toast.success('Expediente transferido.');
    });
  };

  const markResponded = async (): Promise<void> => {
    await run(async () => {
      expediente.setData({ ...data, ...(await expedientesApi.respondExpediente(id)) });
      toast.success('Correspondencia marcada como respondida.');
    });
  };

  const removeExpediente = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Eliminar expediente',
      message: 'Los documentos quedarán libres pero el expediente desaparecerá. Esta acción no se deshace.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await run(async () => {
      await expedientesApi.deleteExpediente(id);
      toast.success('Expediente eliminado.');
      navigate('/expedientes', { replace: true });
    });
  };

  const addDocument = async (documentId: string): Promise<void> => {
    await run(async () => {
      const documents = await expedientesApi.addDocuments(id, [documentId]);
      expediente.setData({ ...data, documents, document_count: documents.length });
      toast.success('Documento añadido al expediente.');
    });
  };

  const removeDocument = async (documentId: string): Promise<void> => {
    const ok = await confirm({
      title: 'Quitar del expediente',
      message: 'El documento saldrá del expediente pero no se elimina del archivo.',
      tone: 'danger',
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    await run(async () => {
      const documents = await expedientesApi.removeDocument(id, documentId);
      expediente.setData({ ...data, documents, document_count: documents.length });
    });
  };

  const exportFuid = async (format: 'xlsx' | 'csv' | 'pdf'): Promise<void> => {
    try {
      await expedientesApi.exportExpediente(id, format);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar el inventario.');
    }
  };

  const typeName = data.is_correspondence
    ? (correspondenceType(data.correspondence_type_code)?.name ?? data.correspondence_type_code)
    : null;

  return (
    <>
      <PageHeader
        title={data.titulo}
        description={data.descripcion ?? undefined}
        icon={<FolderOpen className="h-5 w-5 text-state-warning" aria-hidden />}
        breadcrumbs={[
          { label: 'Inicio', to: '/' },
          { label: 'Expedientes', to: '/expedientes' },
          { label: data.radicado },
        ]}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportFuid('xlsx')}
              icon={<Download className="h-3.5 w-3.5" />}
            >
              FUID (XLSX)
            </Button>
            {data.is_correspondence && !data.responded_at && writable && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void markResponded()}
                icon={<MailCheck className="h-3.5 w-3.5" />}
              >
                Marcar respondida
              </Button>
            )}
            {writable && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void transfer()}
                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
              >
                Transferir
              </Button>
            )}
            {data.estado === 'ABIERTO' && canWrite(data.module_code) && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void close()}
                icon={<Lock className="h-3.5 w-3.5" />}
              >
                Cerrar
              </Button>
            )}
            {data.estado === 'CERRADO' && hasFullAccess && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void reopen()}
                icon={<Unlock className="h-3.5 w-3.5" />}
              >
                Reabrir
              </Button>
            )}
            {hasFullAccess && (
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                onClick={() => void removeExpediente()}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Eliminar
              </Button>
            )}
          </>
        }
      />

      <section className="panel mb-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Radicado</dt>
            <dd className="font-mono text-sm text-acid">{data.radicado}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Dependencia</dt>
            <dd>
              <Badge color={moduleColor(data.module_code)}>{moduleLabel(data.module_code)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Estado</dt>
            <dd>
              <Badge color={ESTADO_COLORS[data.estado]}>{data.estado}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Apertura</dt>
            <dd className="text-sm text-content-secondary">{formatDate(data.fecha_apertura)}</dd>
          </div>
          {data.fecha_cierre && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Cierre</dt>
              <dd className="text-sm text-content-secondary">{formatDate(data.fecha_cierre)}</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Serie / Subserie</dt>
            <dd className="text-sm text-content-secondary">
              {[data.serie, data.subserie].filter(Boolean).join(' / ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-content-muted">Responsable</dt>
            <dd className="text-sm text-content-secondary">{data.responsable?.full_name ?? '—'}</dd>
          </div>
          {typeName && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-content-muted">Tipo</dt>
              <dd className="text-sm text-content-secondary">{typeName}</dd>
            </div>
          )}
          {data.is_correspondence && (
            <>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-content-muted">Remitente</dt>
                <dd className="text-sm text-content-secondary">{data.sender ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-content-muted">Destinatario</dt>
                <dd className="text-sm text-content-secondary">{data.recipient ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-content-muted">Respuesta</dt>
                <dd className="text-sm text-content-secondary">
                  {data.responded_at ? (
                    <Badge color="var(--color-success)">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      {formatDate(data.responded_at)}
                    </Badge>
                  ) : data.response_due_at ? (
                    <Badge color="var(--color-warning)">Vence {formatDate(data.response_due_at)}</Badge>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base text-content-primary">
            Documentos ({data.documents.length})
          </h2>
          {writable && (
            <Button size="sm" variant="primary" onClick={() => setAdding(true)} icon={<Plus className="h-3.5 w-3.5" />}>
              Añadir documento
            </Button>
          )}
        </div>

        {data.documents.length === 0 ? (
          <EmptyState
            title="Expediente vacío"
            description="Añade documentos para conformar el expediente y su foliación."
            action={writable ? { label: 'Añadir documento', onClick: () => setAdding(true) } : undefined}
          />
        ) : (
          <ol className="space-y-2">
            {data.documents.map((entry) => (
              <li
                key={entry.document.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3"
              >
                <span className="w-8 flex-shrink-0 text-center font-mono text-xs text-content-muted">
                  {entry.orden}
                </span>
                <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
                <button
                  type="button"
                  onClick={() => navigate(`/documentos/${entry.document.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm text-content-primary hover:text-acid">
                    {entry.document.title}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
                    <span>{entry.document.type}</span>
                    {entry.document.folio_index ? (
                      <span className="font-mono">Folio {entry.document.folio_index}</span>
                    ) : (
                      <Badge color="var(--color-warning)">Sin foliar</Badge>
                    )}
                    <Badge color={statusColor(entry.document.status_code)}>
                      {statusLabel(entry.document.status_code)}
                    </Badge>
                    <span>{formatBytes(entry.document.file_size)}</span>
                    <span>· incluido {formatDateTime(entry.fecha_inclusion)}</span>
                  </p>
                </button>
                {writable && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar ${entry.document.title} del expediente`}
                    onClick={() => void removeDocument(entry.document.id)}
                    icon={<Trash2 className="h-4 w-4" />}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Añadir documento al expediente"
        description="Busca entre los documentos a los que tienes acceso."
      >
        <Input
          data-autofocus
          placeholder="Buscar por título, folio o contenido…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          icon={<Search className="h-4 w-4" />}
          aria-label="Buscar documento"
        />

        {candidates.data && (
          <ul className="mt-3 space-y-1">
            {candidates.data.data
              .filter((doc) => !data.documents.some((entry) => entry.document.id === doc.id))
              .map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => void addDocument(doc.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-acid-border"
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-content-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-content-secondary">{doc.title}</span>
                    <Badge color={moduleColor(doc.module_code)}>{moduleLabel(doc.module_code)}</Badge>
                  </button>
                </li>
              ))}
          </ul>
        )}

        {candidates.data && candidates.data.data.length === 0 && (
          <p className="mt-3 text-sm text-content-muted">Sin coincidencias.</p>
        )}
      </Dialog>
    </>
  );
}
