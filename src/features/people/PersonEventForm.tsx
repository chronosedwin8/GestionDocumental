import { useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as peopleApi from '@/api/people';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { todayInput } from '@/lib/format';
import type { ApiDocument, PersonEvent } from '@/types/api';

export interface PersonEventFormProps {
  open: boolean;
  personId: string;
  /** Documentos de la persona: el evento puede apuntar a uno de ellos. */
  documents: ApiDocument[];
  /** Tipos ya usados en la línea de tiempo (no hay catálogo en el servidor). */
  knownTypes: string[];
  onClose: () => void;
  onCreated: (event: PersonEvent) => void;
}

/** Alta de un evento de seguimiento (`POST /people/:id/events`, P6). */
export function PersonEventForm({
  open,
  personId,
  documents,
  knownTypes,
  onClose,
  onCreated,
}: PersonEventFormProps): React.JSX.Element | null {
  const listId = useId();
  const [eventType, setEventType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(() => todayInput());
  const [documentId, setDocumentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeOptions = useMemo(() => Array.from(new Set(knownTypes)).sort(), [knownTypes]);

  if (!open) return null;

  const save = async (): Promise<void> => {
    if (eventType.trim().length < 2 || title.trim().length < 2 || eventDate === '') {
      setError('Tipo, título y fecha del evento son obligatorios.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await peopleApi.createPersonEvent(personId, {
        event_type: eventType.trim(),
        title: title.trim(),
        event_date: eventDate,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(documentId ? { document_id: documentId } : {}),
      });
      toast.success('Evento registrado en la línea de tiempo.');
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo registrar el evento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissable={!saving}
      title="Registrar evento de seguimiento"
      description="Queda en la línea de tiempo de la persona con tu usuario y la fecha de registro."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-lg border border-state-danger/40 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
            {error}
          </p>
        )}

        <FormField
          label="Tipo de evento"
          required
          hint={
            typeOptions.length > 0
              ? 'Puedes reutilizar un tipo ya usado o escribir uno nuevo.'
              : 'Escribe el tipo de evento (por ejemplo, el que use el colegio en sus procesos).'
          }
        >
          <Input
            data-autofocus
            list={listId}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        </FormField>
        <datalist id={listId}>
          {typeOptions.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>

        <FormField label="Título" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>

        <FormField label="Descripción">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Fecha del evento" required>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </FormField>
          <FormField
            label="Documento vinculado"
            hint={
              documents.length === 0
                ? 'Esta persona todavía no tiene documentos asociados.'
                : 'Opcional: soporta el evento con un documento del expediente.'
            }
          >
            <Select
              placeholder="Sin documento"
              disabled={documents.length === 0}
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              options={documents.map((doc) => ({
                value: doc.id,
                label: doc.folio_index ? `${doc.folio_index} · ${doc.title}` : doc.title,
              }))}
            />
          </FormField>
        </div>
      </div>
    </Dialog>
  );
}
