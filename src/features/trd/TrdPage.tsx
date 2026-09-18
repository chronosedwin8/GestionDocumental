import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as trdApi from '@/api/trd';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { IfFeature } from '@/components/ui/IfFeature';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toolbar } from '@/components/ui/Toolbar';
import type { RetentionRule } from '@/types/api';
import type { Column } from '@/types/ui';

interface RuleForm {
  id: string | null;
  module_code: string;
  document_type: string;
  retention_years: string;
  disposition_code: string;
  description: string;
}

const EMPTY_FORM: RuleForm = {
  id: null,
  module_code: '',
  document_type: '',
  retention_years: '5',
  disposition_code: '',
  description: '',
};

export interface TrdPageProps {
  /** Dentro del panel de administración no se repite la cabecera de página. */
  embedded?: boolean;
}

/** Tabla de Retención Documental. Las disposiciones vienen del catálogo. */
export default function TrdPage({ embedded = false }: TrdPageProps): React.JSX.Element {
  const { activeModules, dispositions, dispositionLabel, dispositionColor, moduleLabel, moduleColor } =
    useCatalogs();
  const { canWrite, hasFullAccess } = useAuth();
  const { confirm } = useDialogs();

  const [moduleFilter, setModuleFilter] = useState('');
  const [form, setForm] = useState<RuleForm | null>(null);
  const [saving, setSaving] = useState(false);

  const rules = useQuery(`trd:list:${moduleFilter}`, (signal) =>
    trdApi.listRules(moduleFilter || undefined, signal),
  );

  const canEdit = hasFullAccess || activeModules.some((module) => canWrite(module.code));

  const columns = useMemo<Column<RetentionRule>[]>(
    () => [
      {
        key: 'module',
        header: 'Dependencia',
        sortField: 'module_code',
        render: (rule) => <Badge color={moduleColor(rule.module_code)}>{moduleLabel(rule.module_code)}</Badge>,
      },
      {
        key: 'type',
        header: 'Tipo documental',
        sortField: 'document_type',
        primary: true,
        required: true,
        render: (rule) => <span className="text-sm text-content-primary">{rule.document_type}</span>,
      },
      {
        key: 'years',
        header: 'Retención',
        sortField: 'retention_years',
        render: (rule) => <span className="font-mono text-xs">{rule.retention_years} año(s)</span>,
      },
      {
        key: 'disposition',
        header: 'Disposición final',
        render: (rule) => (
          <Badge color={dispositionColor(rule.disposition_code)}>
            {dispositionLabel(rule.disposition_code)}
          </Badge>
        ),
      },
      {
        key: 'description',
        header: 'Procedimiento',
        render: (rule) => (
          <span className="text-xs text-content-muted">{rule.description ?? '—'}</span>
        ),
      },
    ],
    [moduleColor, moduleLabel, dispositionColor, dispositionLabel],
  );

  const save = async (): Promise<void> => {
    if (!form) return;
    const years = Number(form.retention_years);
    if (!form.module_code || !form.document_type.trim() || !form.disposition_code || Number.isNaN(years)) {
      toast.error('Completa dependencia, tipo documental, años y disposición.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        module_code: form.module_code,
        document_type: form.document_type.trim(),
        retention_years: years,
        disposition_code: form.disposition_code,
        description: form.description.trim() || null,
      };
      if (form.id) await trdApi.updateRule(form.id, payload);
      else await trdApi.createRule(payload);

      invalidatePrefix('trd:');
      await rules.refetch();
      setForm(null);
      toast.success('Regla guardada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la regla.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: RetentionRule): Promise<void> => {
    const ok = await confirm({
      title: 'Eliminar regla de retención',
      message: `Se eliminará la regla de "${rule.document_type}". Los documentos ya clasificados conservan su fecha de retención.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await trdApi.deleteRule(rule.id);
      invalidatePrefix('trd:');
      await rules.refetch();
      toast.success('Regla eliminada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la regla.');
    }
  };

  const exportTrd = async (format: 'csv' | 'xlsx'): Promise<void> => {
    try {
      await trdApi.exportTrd(format, moduleFilter || undefined);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar la TRD.');
    }
  };

  const actions = (
    <>
      <HelpButton slug="ciclo-documental" contextLabel="TRD" label="Ayuda de la TRD" />
      <IfFeature code="TRD_EXPORT">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void exportTrd('xlsx')}
          icon={<Download className="h-3.5 w-3.5" />}
        >
          Exportar
        </Button>
      </IfFeature>
      {canEdit && (
        <IfFeature code="TRD_EDIT">
          <Button
            variant="primary"
            onClick={() => setForm({ ...EMPTY_FORM, module_code: moduleFilter || activeModules[0]?.code || '' })}
            icon={<Plus className="h-4 w-4" />}
          >
            Nueva regla
          </Button>
        </IfFeature>
      )}
    </>
  );

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Tablas de Retención Documental"
          description="Tiempos de retención y disposición final por tipo documental (Acuerdo AGN 004/2019)."
          icon={<FileSpreadsheet className="h-5 w-5 text-state-info" aria-hidden />}
          breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'TRD' }]}
          actions={actions}
        />
      )}

      <Toolbar className="mb-4" ariaLabel="Filtros de TRD">
        <Select
          className="w-64"
          aria-label="Filtrar por dependencia"
          placeholder="Todas las dependencias"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
        />
        {embedded && (
          <>
            <div className="flex-1" />
            {actions}
          </>
        )}
      </Toolbar>

      {rules.error ? (
        <ApiErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rules.data ?? []}
          rowKey={(rule) => rule.id}
          loading={rules.loading}
          emptyTitle="Sin reglas de retención"
          emptyDescription="Define los tipos documentales y sus tiempos de conservación."
          emptyAction={
            canEdit
              ? {
                  label: 'Crear la primera regla',
                  onClick: () =>
                    setForm({ ...EMPTY_FORM, module_code: moduleFilter || activeModules[0]?.code || '' }),
                }
              : undefined
          }
          caption="Tablas de retención documental"
          rowActions={
            canEdit
              ? (rule) => (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${rule.document_type}`}
                      onClick={() =>
                        setForm({
                          id: rule.id,
                          module_code: rule.module_code,
                          document_type: rule.document_type,
                          retention_years: String(rule.retention_years),
                          disposition_code: rule.disposition_code,
                          description: rule.description ?? '',
                        })
                      }
                      icon={<Pencil className="h-4 w-4" />}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar ${rule.document_type}`}
                      onClick={() => void remove(rule)}
                      icon={<Trash2 className="h-4 w-4" />}
                    />
                  </>
                )
              : undefined
          }
        />
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          title={form.id ? 'Editar regla de retención' : 'Nueva regla de retención'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <FormField
              label="Dependencia"
              required
              hint="Solo aparecen las dependencias donde puedes escribir: mover una regla a otra dependencia sin permiso devuelve 403."
            >
              <Select
                value={form.module_code}
                onChange={(e) => setForm({ ...form, module_code: e.target.value })}
                placeholder="Selecciona…"
                options={activeModules
                  .filter((module) => hasFullAccess || canWrite(module.code))
                  .map((module) => ({ value: module.code, label: module.name }))}
              />
            </FormField>

            <FormField label="Tipo documental" required>
              <Input
                data-autofocus
                value={form.document_type}
                onChange={(e) => setForm({ ...form, document_type: e.target.value })}
                placeholder="Ej. Contratos de prestación de servicios"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Años de retención" required>
                <Input
                  type="number"
                  min={0}
                  value={form.retention_years}
                  onChange={(e) => setForm({ ...form, retention_years: e.target.value })}
                />
              </FormField>
              <FormField label="Disposición final" required>
                <Select
                  value={form.disposition_code}
                  onChange={(e) => setForm({ ...form, disposition_code: e.target.value })}
                  placeholder="Selecciona…"
                  options={dispositions.map((entry) => ({ value: entry.code, label: entry.name }))}
                />
              </FormField>
            </div>

            <FormField label="Procedimiento / observaciones">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </>
  );
}
