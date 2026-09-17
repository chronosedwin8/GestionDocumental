import { useState } from 'react';
import toast from 'react-hot-toast';
import * as expedientesApi from '@/api/expedientes';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { Expediente, Module } from '@/types/api';

export interface NewCorrespondenceFormProps {
  open: boolean;
  modules: Module[];
  onClose: () => void;
  onCreated: (expediente: Expediente) => void;
}

export function NewCorrespondenceForm({
  open,
  modules,
  onClose,
  onCreated,
}: NewCorrespondenceFormProps): React.JSX.Element {
  const { correspondenceTypes, correspondenceType } = useCatalogs();

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [moduleCode, setModuleCode] = useState(modules[0]?.code ?? '');
  const [typeCode, setTypeCode] = useState(correspondenceTypes[0]?.code ?? '');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = correspondenceType(typeCode);

  const submit = async (): Promise<void> => {
    if (titulo.trim() === '' || moduleCode === '' || typeCode === '') {
      setError('Título, dependencia y tipo de correspondencia son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await expedientesApi.createCorrespondence({
        titulo: titulo.trim(),
        module_code: moduleCode,
        correspondence_type_code: typeCode,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(sender.trim() ? { sender: sender.trim() } : {}),
        ...(recipient.trim() ? { recipient: recipient.trim() } : {}),
      });
      toast.success(`Correspondencia radicada: ${created.radicado}`);
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo radicar la correspondencia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Radicar correspondencia"
      description="El consecutivo y el plazo de respuesta los calcula el servidor según el tipo."
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Radicar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-lg border border-state-danger/40 bg-state-danger/10 p-2.5 text-xs text-state-danger">
            {error}
          </p>
        )}

        <FormField label="Asunto" required>
          <Input data-autofocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Dependencia" required>
            <Select
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value)}
              placeholder="Selecciona…"
              options={modules.map((module) => ({ value: module.code, label: module.name }))}
            />
          </FormField>
          <FormField
            label="Tipo"
            required
            hint={
              selectedType?.response_days
                ? `Plazo de respuesta: ${selectedType.response_days} día(s) hábiles.`
                : undefined
            }
          >
            <Select
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value)}
              placeholder="Selecciona…"
              options={correspondenceTypes.map((entry) => ({ value: entry.code, label: entry.name }))}
            />
          </FormField>
          <FormField label="Remitente">
            <Input value={sender} onChange={(e) => setSender(e.target.value)} />
          </FormField>
          <FormField label="Destinatario">
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Descripción">
          <Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </FormField>
      </div>
    </Dialog>
  );
}
