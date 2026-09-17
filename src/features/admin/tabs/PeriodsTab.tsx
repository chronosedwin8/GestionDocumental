import { useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import * as peopleApi from '@/api/people';
import { ApiError } from '@/api/client';
import { useDialogs } from '@/contexts/DialogContext';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Toolbar } from '@/components/ui/Toolbar';
import { formatDate } from '@/lib/format';
import type { AcademicPeriod } from '@/types/api';
import type { Column } from '@/types/ui';

interface PeriodForm {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

const EMPTY_FORM: PeriodForm = { name: '', start_date: '', end_date: '', is_current: false };

/**
 * Periodos académicos (P7): el año lectivo vigente es el que usa el servidor
 * para abrir el expediente de un estudiante nuevo.
 */
export function PeriodsTab(): React.JSX.Element {
  const { confirm } = useDialogs();
  const [form, setForm] = useState<PeriodForm | null>(null);
  const [saving, setSaving] = useState(false);

  const periods = useQuery('academic-periods', (signal) => peopleApi.listAcademicPeriods(signal));
  const rows = useMemo(() => periods.data ?? [], [periods.data]);

  const refresh = async (): Promise<void> => {
    invalidatePrefix('academic-periods');
    await periods.refetch();
  };

  const save = async (): Promise<void> => {
    if (!form) return;
    if (form.name.trim().length < 3 || !form.start_date || !form.end_date) {
      toast.error('Nombre, fecha de inicio y fecha de fin son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      await peopleApi.createAcademicPeriod({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        is_current: form.is_current,
      });
      toast.success('Periodo académico creado.');
      setForm(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear el periodo.');
    } finally {
      setSaving(false);
    }
  };

  const markCurrent = async (period: AcademicPeriod): Promise<void> => {
    const ok = await confirm({
      title: 'Marcar como periodo actual',
      message: `Los estudiantes que se registren a partir de ahora abrirán su expediente en "${period.name}".`,
      confirmLabel: 'Marcar como actual',
    });
    if (!ok) return;
    try {
      await peopleApi.updateAcademicPeriod(period.id, { is_current: true });
      toast.success('Periodo actual actualizado.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el periodo.');
    }
  };

  const columns = useMemo<Column<AcademicPeriod>[]>(
    () => [
      {
        key: 'name',
        header: 'Periodo',
        required: true,
        primary: true,
        render: (period) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-content-primary">{period.name}</span>
            {period.is_current && <Badge color="var(--color-success)">Actual</Badge>}
          </span>
        ),
      },
      {
        key: 'start',
        header: 'Inicio',
        render: (period) => <span className="text-xs">{formatDate(period.start_date)}</span>,
      },
      {
        key: 'end',
        header: 'Fin',
        render: (period) => <span className="text-xs">{formatDate(period.end_date)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Acciones de periodos académicos">
        <p className="flex items-center gap-2 text-xs text-content-muted">
          <CalendarRange className="h-4 w-4 text-acid" aria-hidden />
          Los boletines, actas y expedientes de estudiantes se clasifican por año lectivo.
        </p>
        <div className="flex-1" />
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm(EMPTY_FORM)}>
          Nuevo periodo
        </Button>
      </Toolbar>

      {periods.error ? (
        <ApiErrorState error={periods.error} onRetry={() => void periods.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(period) => period.id}
          loading={periods.loading}
          allowColumnToggle={false}
          caption="Periodos académicos"
          emptyTitle="Sin periodos académicos"
          emptyDescription="Crea el año lectivo vigente para poder abrir expedientes de estudiantes."
          emptyAction={{ label: 'Nuevo periodo', onClick: () => setForm(EMPTY_FORM) }}
          rowActions={(period) =>
            period.is_current ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-state-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Vigente
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void markCurrent(period)}>
                Marcar como actual
              </Button>
            )
          }
        />
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          title="Nuevo periodo académico"
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Crear
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <FormField label="Nombre" required hint="Por ejemplo, el año lectivo tal como lo nombra el colegio.">
              <Input
                data-autofocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Fecha de inicio" required>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </FormField>
              <FormField label="Fecha de fin" required>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-xs text-content-secondary">
              <input
                type="checkbox"
                className="accent-[color:var(--color-acid)]"
                checked={form.is_current}
                onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
              />
              Marcar como periodo actual
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}
