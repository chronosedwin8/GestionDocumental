import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as catalogsApi from '@/api/catalogs';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import type { DocumentStatus, Module, Role } from '@/types/api';

type View = 'modulos' | 'roles' | 'estados';

interface ModuleDraft {
  name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: string;
  is_active: boolean;
}

/**
 * Edición de los catálogos que antes estaban hardcodeados en el cliente
 * (las antiguas tablas de etiquetas y colores escritas en el cliente).
 */
export function CatalogsTab(): React.JSX.Element {
  const { modules, roles, statuses, reload } = useCatalogs();
  const [view, setView] = useState<View>('modulos');
  const [editing, setEditing] = useState<string | null>(null);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<Partial<Role> | null>(null);
  const [statusDraft, setStatusDraft] = useState<Partial<DocumentStatus> | null>(null);
  const [saving, setSaving] = useState(false);

  const cancel = (): void => {
    setEditing(null);
    setModuleDraft(null);
    setRoleDraft(null);
    setStatusDraft(null);
  };

  const saveModule = async (code: string): Promise<void> => {
    if (!moduleDraft) return;
    setSaving(true);
    try {
      await catalogsApi.updateModule(code, {
        name: moduleDraft.name.trim(),
        description: moduleDraft.description.trim() || null,
        icon: moduleDraft.icon.trim(),
        color: moduleDraft.color,
        sort_order: Number(moduleDraft.sort_order) || 0,
        is_active: moduleDraft.is_active,
      });
      await reload();
      cancel();
      toast.success('Módulo actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el módulo.');
    } finally {
      setSaving(false);
    }
  };

  const saveRole = async (code: string): Promise<void> => {
    if (!roleDraft) return;
    setSaving(true);
    try {
      await catalogsApi.updateRole(code, roleDraft);
      await reload();
      cancel();
      toast.success('Rol actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el rol.');
    } finally {
      setSaving(false);
    }
  };

  const saveStatus = async (code: string): Promise<void> => {
    if (!statusDraft) return;
    setSaving(true);
    try {
      await catalogsApi.updateDocumentStatus(code, statusDraft);
      await reload();
      cancel();
      toast.success('Estado actualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setSaving(false);
    }
  };

  const startModule = (module: Module): void => {
    setEditing(module.code);
    setModuleDraft({
      name: module.name,
      description: module.description ?? '',
      icon: module.icon,
      color: module.color,
      sort_order: String(module.sort_order),
      is_active: module.is_active,
    });
  };

  return (
    <div className="space-y-4">
      <Tabs
        ariaLabel="Catálogos editables"
        value={view}
        onChange={(id) => {
          setView(id as View);
          cancel();
        }}
        items={[
          { id: 'modulos', label: 'Módulos' },
          { id: 'roles', label: 'Roles' },
          { id: 'estados', label: 'Estados documentales' },
        ]}
      />

      {view === 'modulos' && (
        <ul className="space-y-2">
          {modules.map((module) => (
            <li key={module.code} className="rounded-card border border-line bg-surface-sunken p-3">
              {editing === module.code && moduleDraft ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label="Nombre" required>
                      <Input
                        data-autofocus
                        value={moduleDraft.name}
                        onChange={(e) => setModuleDraft({ ...moduleDraft, name: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Icono (nombre de lucide)" hint="Ej. GraduationCap, Briefcase, Scale.">
                      <Input
                        value={moduleDraft.icon}
                        onChange={(e) => setModuleDraft({ ...moduleDraft, icon: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Color">
                      <Input
                        type="color"
                        className="h-10 w-20 p-1"
                        value={moduleDraft.color}
                        onChange={(e) => setModuleDraft({ ...moduleDraft, color: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Orden">
                      <Input
                        type="number"
                        value={moduleDraft.sort_order}
                        onChange={(e) => setModuleDraft({ ...moduleDraft, sort_order: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <FormField label="Descripción">
                    <Textarea
                      rows={2}
                      value={moduleDraft.description}
                      onChange={(e) => setModuleDraft({ ...moduleDraft, description: e.target.value })}
                    />
                  </FormField>
                  <label className="flex items-center gap-2 text-xs text-content-secondary">
                    <input
                      type="checkbox"
                      className="accent-[color:var(--color-acid)]"
                      checked={moduleDraft.is_active}
                      onChange={(e) => setModuleDraft({ ...moduleDraft, is_active: e.target.checked })}
                    />
                    Módulo activo
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={saving}
                      onClick={() => void saveModule(module.code)}
                      icon={<Save className="h-3.5 w-3.5" />}
                    >
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancel} icon={<X className="h-3.5 w-3.5" />}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <DynamicIcon
                    name={module.icon}
                    className="h-5 w-5 flex-shrink-0"
                    style={{ color: module.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content-primary">{module.name}</p>
                    <p className="truncate text-[11px] text-content-muted">
                      <code className="font-mono">{module.code}</code>
                      {module.description && ` · ${module.description}`}
                    </p>
                  </div>
                  <Badge color={module.is_active ? 'var(--color-success)' : 'var(--color-danger)'}>
                    {module.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${module.name}`}
                    onClick={() => startModule(module)}
                    icon={<Pencil className="h-4 w-4" />}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {view === 'roles' && (
        <ul className="space-y-2">
          {roles.map((role) => (
            <li key={role.code} className="rounded-card border border-line bg-surface-sunken p-3">
              {editing === role.code && roleDraft ? (
                <div className="space-y-3">
                  <FormField label="Nombre" required>
                    <Input
                      data-autofocus
                      value={roleDraft.name ?? ''}
                      onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Descripción">
                    <Textarea
                      rows={2}
                      value={roleDraft.description ?? ''}
                      onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })}
                    />
                  </FormField>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-content-secondary">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--color-acid)]"
                        checked={roleDraft.has_full_access ?? false}
                        onChange={(e) => setRoleDraft({ ...roleDraft, has_full_access: e.target.checked })}
                      />
                      Acceso total
                    </label>
                    <label className="flex items-center gap-2 text-xs text-content-secondary">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--color-acid)]"
                        checked={roleDraft.can_manage_users ?? false}
                        onChange={(e) => setRoleDraft({ ...roleDraft, can_manage_users: e.target.checked })}
                      />
                      Puede gestionar usuarios
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={saving}
                      onClick={() => void saveRole(role.code)}
                      icon={<Save className="h-3.5 w-3.5" />}
                    >
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancel} icon={<X className="h-3.5 w-3.5" />}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content-primary">{role.name}</p>
                    <p className="truncate text-[11px] text-content-muted">
                      <code className="font-mono">{role.code}</code>
                      {role.description && ` · ${role.description}`}
                    </p>
                  </div>
                  {role.has_full_access && <Badge color="var(--color-acid)">Acceso total</Badge>}
                  {role.can_manage_users && <Badge color="var(--color-info)">Gestiona usuarios</Badge>}
                  {role.is_system && <Badge>Sistema</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${role.name}`}
                    onClick={() => {
                      setEditing(role.code);
                      setRoleDraft({ ...role });
                    }}
                    icon={<Pencil className="h-4 w-4" />}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {view === 'estados' && (
        <ul className="space-y-2">
          {statuses.map((status) => (
            <li key={status.code} className="rounded-card border border-line bg-surface-sunken p-3">
              {editing === status.code && statusDraft ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label="Nombre" required>
                      <Input
                        data-autofocus
                        value={statusDraft.name ?? ''}
                        onChange={(e) => setStatusDraft({ ...statusDraft, name: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Color">
                      <Input
                        type="color"
                        className="h-10 w-20 p-1"
                        value={statusDraft.color ?? '#a1a1aa'}
                        onChange={(e) => setStatusDraft({ ...statusDraft, color: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-content-secondary">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--color-acid)]"
                        checked={statusDraft.allows_edit ?? false}
                        onChange={(e) => setStatusDraft({ ...statusDraft, allows_edit: e.target.checked })}
                      />
                      Permite edición
                    </label>
                    <label className="flex items-center gap-2 text-xs text-content-secondary">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--color-acid)]"
                        checked={statusDraft.is_terminal ?? false}
                        onChange={(e) => setStatusDraft({ ...statusDraft, is_terminal: e.target.checked })}
                      />
                      Estado terminal
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={saving}
                      onClick={() => void saveStatus(status.code)}
                      icon={<Save className="h-3.5 w-3.5" />}
                    >
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancel} icon={<X className="h-3.5 w-3.5" />}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Badge color={status.color}>{status.name}</Badge>
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-content-muted">
                    {status.code}
                  </code>
                  {status.allows_edit && <Badge>Editable</Badge>}
                  {status.is_terminal && <Badge color="var(--color-warning)">Terminal</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${status.name}`}
                    onClick={() => {
                      setEditing(status.code);
                      setStatusDraft({ ...status });
                    }}
                    icon={<Pencil className="h-4 w-4" />}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
