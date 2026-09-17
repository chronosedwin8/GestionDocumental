import { useState } from 'react';
import toast from 'react-hot-toast';
import * as expedientesApi from '@/api/expedientes';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { Expediente, Module } from '@/types/api';

export interface NewExpedienteFormProps {
  open: boolean;
  modules: Module[];
  onClose: () => void;
  onCreated: (expediente: Expediente) => void;
}

export function NewExpedienteForm({
  open,
  modules,
  onClose,
  onCreated,
}: NewExpedienteFormProps): React.JSX.Element {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [moduleCode, setModuleCode] = useState(modules[0]?.code ?? '');
  const [serie, setSerie] = useState('');
  const [subserie, setSubserie] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (titulo.trim() === '' || moduleCode === '') {
      setError('El título y la dependencia son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await expedientesApi.createExpediente({
        titulo: titulo.trim(),
        module_code: moduleCode,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(serie.trim() ? { serie: serie.trim() } : {}),
        ...(subserie.trim() ? { subserie: subserie.trim() } : {}),
      });
      toast.success(`Expediente ${created.radicado} creado.`);
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el expediente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nuevo expediente"
      description="El radicado se genera automáticamente con el consecutivo de la dependencia."
      dismissable={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Crear expediente
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

        <FormField label="Título" required>
          <Input data-autofocus value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </FormField>

        <FormField label="Dependencia" required>
          <Select
            value={moduleCode}
            onChange={(e) => setModuleCode(e.target.value)}
            placeholder="Selecciona…"
            options={modules.map((module) => ({ value: module.code, label: module.name }))}
          />
        </FormField>

        <FormField label="Descripción">
          <Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Serie">
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
          </FormField>
          <FormField label="Subserie">
            <Input value={subserie} onChange={(e) => setSubserie(e.target.value)} />
          </FormField>
        </div>
      </div>
    </Dialog>
  );
}
