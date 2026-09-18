import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { IfFeature } from '@/components/ui/IfFeature';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { formatDateTime, initials } from '@/lib/format';

export interface NotesTabProps {
  documentId: string;
  canWrite: boolean;
}

export function NotesTab({ documentId, canWrite }: NotesTabProps): React.JSX.Element {
  const notes = useQuery(`document:${documentId}:notes`, () => documentsApi.listNotes(documentId));
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const note = await documentsApi.addNote(documentId, trimmed);
      notes.setData([note, ...(notes.data ?? [])]);
      setText('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la nota.');
    } finally {
      setSaving(false);
    }
  };

  if (notes.error) return <ApiErrorState error={notes.error} onRetry={() => void notes.refetch()} />;

  return (
    <div className="space-y-4">
      {/* Crear notas exige escritura sobre el documento: el servidor responde
          403 FORBIDDEN sin ella (CONTRACT_NOTES §9), y el mensaje del rechazo
          se muestra tal cual en el aviso. */}
      {canWrite && (
        <IfFeature code="DOCUMENT_NOTE_ADD">
        <div className="rounded-card border border-line bg-surface-sunken p-3">
          <Textarea
            rows={3}
            value={text}
            placeholder="Escribe una nota interna sobre este documento…"
            aria-label="Nueva nota"
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            className="mt-2"
            size="sm"
            variant="primary"
            loading={saving}
            disabled={text.trim() === ''}
            onClick={() => void add()}
            icon={<MessageSquarePlus className="h-3.5 w-3.5" />}
          >
            Añadir nota
          </Button>
        </div>
        </IfFeature>
      )}

      {notes.loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (notes.data ?? []).length === 0 ? (
        <EmptyState title="Sin notas" description="Todavía nadie ha comentado este documento." />
      ) : (
        <ul className="space-y-2">
          {(notes.data ?? []).map((note) => (
            <li key={note.id} className="rounded-lg border border-line bg-surface-sunken p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acid-soft font-mono text-[10px] font-bold text-acid">
                  {initials(note.author.full_name)}
                </span>
                <span className="text-xs font-medium text-content-primary">{note.author.full_name}</span>
                <span className="text-[10px] text-content-muted">{formatDateTime(note.created_at)}</span>
              </div>
              <p className="whitespace-pre-line text-sm text-content-secondary">{note.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
