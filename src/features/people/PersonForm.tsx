import { useState } from 'react';
import toast from 'react-hot-toast';
import * as peopleApi from '@/api/people';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toDateInput } from '@/lib/format';
import type { Person } from '@/types/api';

export interface PersonFormProps {
  open: boolean;
  /** `null` = alta; con persona = edición. */
  person: Person | null;
  onClose: () => void;
  onSaved: (person: Person) => void;
}

interface FormState {
  type_code: string;
  document_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  hire_date: string;
  termination_date: string;
  position: string;
  grade: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function initialState(person: Person | null, fallbackType: string): FormState {
  return {
    type_code: person?.type_code ?? fallbackType,
    document_number: person?.document_number ?? '',
    first_name: person?.first_name ?? '',
    last_name: person?.last_name ?? '',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    birth_date: toDateInput(person?.birth_date),
    hire_date: toDateInput(person?.hire_date),
    termination_date: toDateInput(person?.termination_date),
    position: person?.position ?? '',
    grade: person?.grade ?? '',
    status: person?.status ?? 'ACTIVE',
  };
}

/** Alta y edición de personas (P6/P7). Los tipos vienen del catálogo. */
export function PersonForm({ open, person, onClose, onSaved }: PersonFormProps): React.JSX.Element | null {
  const { personTypes, personTypeLabel } = useCatalogs();
  const [form, setForm] = useState<FormState>(() => initialState(person, personTypes[0]?.code ?? ''));
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (!open) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim());

  const save = async (): Promise<void> => {
    if (!form.type_code || !form.document_number.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setFieldError('Tipo, número de documento, nombres y apellidos son obligatorios.');
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const payload = {
        type_code: form.type_code,
        document_number: form.document_number.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: optional(form.email),
        phone: optional(form.phone),
        birth_date: optional(form.birth_date),
        hire_date: optional(form.hire_date),
        termination_date: optional(form.termination_date),
        position: optional(form.position),
        grade: optional(form.grade),
        status: form.status,
      };
      const saved = person
        ? await peopleApi.updatePerson(person.id, payload)
        : await peopleApi.createPerson(payload);
      toast.success(person ? 'Persona actualizada.' : 'Persona registrada.');
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la persona.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissable={!saving}
      size="lg"
      title={person ? `Editar a ${person.full_name}` : 'Registrar persona'}
      description={
        person
          ? undefined
          : 'Al registrar un empleado o un estudiante el servidor abre su expediente automáticamente.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {fieldError && (
          <p role="alert" className="rounded-lg border border-state-danger/40 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
            {fieldError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Tipo de persona" required>
            <Select
              value={form.type_code}
              disabled={person !== null}
              onChange={(e) => set('type_code', e.target.value)}
              options={personTypes.map((type) => ({ value: type.code, label: type.name }))}
            />
          </FormField>
          <FormField label="Número de documento" required>
            <Input
              data-autofocus
              value={form.document_number}
              onChange={(e) => set('document_number', e.target.value)}
            />
          </FormField>
          <FormField label="Nombres" required>
            <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </FormField>
          <FormField label="Apellidos" required>
            <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </FormField>
          <FormField label="Correo electrónico">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </FormField>
          <FormField label="Teléfono">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </FormField>
          <FormField label="Fecha de nacimiento">
            <Input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
          </FormField>
          <FormField label="Estado">
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE')}
              options={[
                { value: 'ACTIVE', label: 'Activo' },
                { value: 'INACTIVE', label: 'Inactivo' },
              ]}
            />
          </FormField>
          <FormField label="Cargo" hint="Aplica a personal vinculado.">
            <Input value={form.position} onChange={(e) => set('position', e.target.value)} />
          </FormField>
          <FormField label="Grado o curso" hint="Aplica a estudiantes.">
            <Input value={form.grade} onChange={(e) => set('grade', e.target.value)} />
          </FormField>
          <FormField label="Fecha de vinculación">
            <Input type="date" value={form.hire_date} onChange={(e) => set('hire_date', e.target.value)} />
          </FormField>
          <FormField label="Fecha de retiro">
            <Input
              type="date"
              value={form.termination_date}
              onChange={(e) => set('termination_date', e.target.value)}
            />
          </FormField>
        </div>

        <p className="text-[11px] text-content-muted">
          Tipo seleccionado: {personTypeLabel(form.type_code)}.
        </p>
      </div>
    </Dialog>
  );
}
