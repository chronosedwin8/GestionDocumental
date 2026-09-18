import { useCallback, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  BookOpen,
  Bot,
  FileText,
  Hash,
  History,
  Info,
  Link2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Tags,
  Trash2,
  Unlock,
  BookUser,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useHotkeys } from '@/hooks/useHotkeys';
import { invalidatePrefix } from '@/hooks/useQuery';
import { AiStatusIndicator } from '@/components/ai/AiStatusIndicator';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { BookmarkButton } from '@/components/ui/BookmarkButton';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { useDocument } from '../useDocument';
import { ChatTab } from './ChatTab';
import { CustodyTab } from './CustodyTab';
import { InfoTab } from './InfoTab';
import { MetadataTab } from './MetadataTab';
import { NotesTab } from './NotesTab';
import { RelationsTab } from './RelationsTab';
import { SecurityTab } from './SecurityTab';
import { TrdTab } from './TrdTab';
import { VersionsTab } from './VersionsTab';
import { ViewerPane } from './ViewerPane';

export interface DocumentViewerProps {
  documentId: string;
  open: boolean;
  onClose: () => void;
  /** Navegar a otro documento (relaciones). */
  onNavigate?: (id: string) => void;
  /** Se llama cuando el documento deja de estar en la lista (papelera). */
  onRemoved?: (id: string) => void;
}

type TabId =
  | 'info'
  | 'metadata'
  | 'trd'
  | 'security'
  | 'chat'
  | 'notes'
  | 'versions'
  | 'relations'
  | 'custody';

export function DocumentViewer({
  documentId,
  open,
  onClose,
  onNavigate,
  onRemoved,
}: DocumentViewerProps): React.JSX.Element | null {
  const { canWrite, hasFullAccess } = useAuth();
  const { status, statusLabel, statusColor, moduleLabel, moduleColor, settings } = useCatalogs();
  const { confirm, promptText } = useDialogs();
  const { document, loading, error, refetch, apply } = useDocument(open ? documentId : null);
  const [tab, setTab] = useState<TabId>('info');
  const [busy, setBusy] = useState(false);

  const statusMeta = document ? status(document.status_code) : undefined;
  const writable =
    document !== undefined &&
    canWrite(document.module_code) &&
    (statusMeta?.allows_edit ?? true) &&
    document.approved_at === null;

  useHotkeys(
    {
      Escape: () => onClose(),
    },
    { enabled: open },
  );

  const run = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      setBusy(true);
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'La acción no se pudo completar.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const tabs = useMemo(() => {
    const base: { id: TabId; label: string; icon: React.ReactNode }[] = [
      { id: 'info', label: 'Info', icon: <Info className="h-3.5 w-3.5" aria-hidden /> },
      { id: 'metadata', label: 'Metadatos', icon: <Tags className="h-3.5 w-3.5" aria-hidden /> },
      { id: 'trd', label: 'TRD', icon: <BookOpen className="h-3.5 w-3.5" aria-hidden /> },
      { id: 'security', label: 'Seguridad', icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> },
    ];
    if (settings?.ai_enabled !== false) {
      base.push({ id: 'chat', label: 'IA Chat', icon: <Bot className="h-3.5 w-3.5" aria-hidden /> });
    }
    base.push(
      { id: 'notes', label: 'Notas', icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden /> },
      { id: 'versions', label: 'Versiones', icon: <History className="h-3.5 w-3.5" aria-hidden /> },
      { id: 'relations', label: 'Relaciones', icon: <Link2 className="h-3.5 w-3.5" aria-hidden /> },
    );
    if (hasFullAccess) {
      base.push({ id: 'custody', label: 'Custodia', icon: <BookUser className="h-3.5 w-3.5" aria-hidden /> });
    }
    return base;
  }, [settings?.ai_enabled, hasFullAccess]);

  if (!open) return null;

  /* ------------------------------------------------------------ acciones */

  const assignFolio = (): Promise<void> =>
    run(async () => {
      if (!document) return;
      const result = await documentsApi.assignFolio(document.id);
      apply({ ...document, folio_index: result.folio_index });
      toast.success(`Folio asignado: ${result.folio_index}`);
    });

  const lock = (): Promise<void> =>
    run(async () => {
      if (!document) return;
      apply(await documentsApi.lockDocument(document.id));
      toast.success('Documento bloqueado.');
    });

  const unlock = (): Promise<void> =>
    run(async () => {
      if (!document) return;
      apply(await documentsApi.unlockDocument(document.id));
      toast.success('Documento desbloqueado.');
    });

  const approve = async (): Promise<void> => {
    if (!document) return;
    const ok = await confirm({
      title: 'Aprobar documento',
      message:
        'La aprobación es irreversible: sella el hash del archivo y bloquea su edición. ¿Deseas continuar?',
      confirmLabel: 'Aprobar',
    });
    if (!ok) return;
    await run(async () => {
      apply(await documentsApi.approveDocument(document.id));
      toast.success('Documento aprobado.');
    });
  };

  const transfer = async (): Promise<void> => {
    if (!document) return;
    const ok = await confirm({
      title: 'Transferir documento',
      message:
        'El documento avanzará a la siguiente fase del ciclo archivístico y quedará registrado en la cadena de custodia.',
      confirmLabel: 'Transferir',
    });
    if (!ok) return;
    await run(async () => {
      apply(await documentsApi.transferDocument(document.id));
      toast.success('Transferencia registrada.');
    });
  };

  const sendToTrash = async (): Promise<void> => {
    if (!document) return;
    const reason = await promptText({
      title: 'Enviar a papelera',
      message: `"${document.title}" podrá restaurarse durante ${settings?.trash_retention_days ?? 30} días.`,
      label: 'Motivo de la eliminación',
      placeholder: 'Describe por qué se elimina este documento…',
      tone: 'danger',
      confirmLabel: 'Enviar a papelera',
      required: true,
    });
    if (!reason) return;
    await run(async () => {
      await documentsApi.trashDocument(document.id, reason);
      invalidatePrefix(`documents:${document.module_code}`);
      invalidatePrefix('trash:');
      invalidatePrefix('stats:');
      toast.success('Documento enviado a la papelera.');
      onRemoved?.(document.id);
      onClose();
    });
  };

  const createLoan = async (): Promise<void> => {
    if (!document) return;
    const userId = await promptText({
      title: 'Prestar documento',
      message: 'Indica el identificador del usuario que recibe el préstamo.',
      label: 'ID del usuario',
      multiline: false,
      minLength: 4,
      confirmLabel: 'Continuar',
    });
    if (!userId) return;
    const purpose = await promptText({
      title: 'Motivo del préstamo',
      label: 'Propósito',
      confirmLabel: 'Prestar',
    });
    if (!purpose) return;

    const due = new Date();
    due.setDate(due.getDate() + 15);

    await run(async () => {
      await documentsApi.createLoan(document.id, {
        loaned_to: userId,
        expected_return_date: due.toISOString(),
        purpose,
      });
      invalidatePrefix('loans:');
      toast.success('Préstamo registrado por 15 días.');
    });
  };

  /* ------------------------------------------------------------- render */

  const body = (): React.JSX.Element => {
    if (error) return <ApiErrorState error={error} onRetry={() => void refetch()} />;
    if (loading || !document) return <FullPageSpinner label="Cargando documento…" />;

    return (
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <div className="min-h-[280px] flex-1 border-line lg:min-h-0 lg:border-r">
          <ViewerPane document={document} />
        </div>

        <div className="flex min-h-0 w-full flex-col lg:w-[440px] xl:w-[500px]">
          <Tabs
            items={tabs}
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            variant="underline"
            ariaLabel="Secciones del documento"
            className="flex-shrink-0 px-2"
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'info' && (
              <InfoTab
                document={document}
                canWrite={writable}
                onUpdated={apply}
                onRefresh={() => void refetch()}
              />
            )}
            {tab === 'metadata' && (
              <MetadataTab
                document={document}
                canWrite={writable}
                onUpdated={apply}
                onRefresh={() => void refetch()}
              />
            )}
            {tab === 'trd' && <TrdTab document={document} canWrite={writable} onUpdated={apply} />}
            {tab === 'security' && (
              <SecurityTab
                document={document}
                canWrite={writable}
                isAdmin={hasFullAccess}
                onLock={() => void lock()}
                onUnlock={() => void unlock()}
                onApprove={() => void approve()}
              />
            )}
            {tab === 'chat' && <ChatTab document={document} />}
            {tab === 'notes' && (
              <NotesTab documentId={document.id} canWrite={canWrite(document.module_code)} />
            )}
            {tab === 'versions' && (
              <VersionsTab document={document} canWrite={writable} onUpdated={() => void refetch()} />
            )}
            {tab === 'relations' && (
              <RelationsTab
                documentId={document.id}
                canWrite={writable}
                onOpenDocument={(id) => onNavigate?.(id)}
              />
            )}
            {tab === 'custody' && hasFullAccess && <CustodyTab documentId={document.id} />}
          </div>
        </div>
      </div>
    );
  };

  const isLocked = document?.status_code === 'BLOQUEO_ADMIN';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      dismissable={!busy}
      bodyClassName="p-0 flex flex-col min-h-0"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
          <span className="truncate">{document?.title ?? 'Documento'}</span>
        </span>
      }
      description={
        document ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge color={moduleColor(document.module_code)}>{moduleLabel(document.module_code)}</Badge>
            <Badge color={statusColor(document.status_code)}>{statusLabel(document.status_code)}</Badge>
            {document.folio_index ? (
              <Badge>Folio {document.folio_index}</Badge>
            ) : (
              <Badge color="var(--color-warning)">Sin foliar</Badge>
            )}
            <AiStatusIndicator status={document.ai_status} error={document.ai_error ?? null} />
          </span>
        ) : undefined
      }
      footer={
        document && (
          <div className="flex w-full flex-wrap items-center gap-2">
            {writable && !document.folio_index && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void assignFolio()}
                icon={<Hash className="h-3.5 w-3.5" />}
              >
                Foliar
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
            {canWrite(document.module_code) && (
              <Button size="sm" variant="outline" loading={busy} onClick={() => void createLoan()}>
                Prestar
              </Button>
            )}
            <BookmarkButton documentId={document.id} documentTitle={document.title} withLabel />
            {hasFullAccess && (
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() => void (isLocked ? unlock() : lock())}
                icon={isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              >
                {isLocked ? 'Desbloquear' : 'Bloquear'}
              </Button>
            )}
            <div className="flex-1" />
            {writable && (
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                onClick={() => void sendToTrash()}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Enviar a papelera
              </Button>
            )}
          </div>
        )
      }
    >
      {body()}
    </Dialog>
  );
}
