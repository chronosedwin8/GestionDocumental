import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as categoriesApi from '@/api/categories';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { invalidatePrefix, useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { Toolbar } from '@/components/ui/Toolbar';
import type { Category } from '@/types/api';

interface CategoryForm {
  id: string | null;
  name: string;
  description: string;
  color: string;
  module_code: string;
  parent_id: string;
}

export function CategoriesTab(): React.JSX.Element {
  const { activeModules } = useCatalogs();
  const { confirm } = useDialogs();
  const [moduleCode, setModuleCode] = useState(activeModules[0]?.code ?? '');
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = useQuery(
    moduleCode ? `categories:admin:${moduleCode}` : null,
    (signal) => categoriesApi.listCategories(moduleCode, false, signal),
  );

  const save = async (): Promise<void> => {
    if (!form || !form.name.trim() || !form.module_code) {
      toast.error('El nombre y la dependencia son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
        module_code: form.module_code,
        parent_id: form.parent_id || null,
      };
      if (form.id) await categoriesApi.updateCategory(form.id, payload);
      else await categoriesApi.createCategory(payload);

      invalidatePrefix('categories:');
      await categories.refetch();
      setForm(null);
      toast.success('Categoría guardada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: Category): Promise<void> => {
    const ok = await confirm({
      title: 'Eliminar categoría',
      message: `Se eliminará "${category.name}". Los documentos ya clasificados conservan el nombre como texto.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await categoriesApi.deleteCategory(category.id);
      invalidatePrefix('categories:');
      await categories.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la categoría.');
    }
  };

  const openNew = (parentId?: string): void =>
    setForm({
      id: null,
      name: '',
      description: '',
      color: '#6366f1',
      module_code: moduleCode,
      parent_id: parentId ?? '',
    });

  const renderRow = (category: Category, depth: number): React.JSX.Element => (
    <li key={category.id}>
      <div
        className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        {depth > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-content-muted" aria-hidden />}
        <span
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-content-primary">{category.name}</p>
          {category.description && (
            <p className="truncate text-[11px] text-content-muted">{category.description}</p>
          )}
        </div>
        {depth === 0 && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Añadir subcategoría a ${category.name}`}
            onClick={() => openNew(category.id)}
            icon={<Plus className="h-4 w-4" />}
          />
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Editar ${category.name}`}
          onClick={() =>
            setForm({
              id: category.id,
              name: category.name,
              description: category.description ?? '',
              color: category.color,
              module_code: category.module_code,
              parent_id: category.parent_id ?? '',
            })
          }
          icon={<Pencil className="h-4 w-4" />}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Eliminar ${category.name}`}
          onClick={() => void remove(category)}
          icon={<Trash2 className="h-4 w-4" />}
        />
      </div>
      {category.subcategories && category.subcategories.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {category.subcategories.map((sub) => renderRow(sub, depth + 1))}
        </ul>
      )}
    </li>
  );

  const parentOptions = (categories.data ?? [])
    .filter((category) => category.parent_id === null)
    .map((category) => ({ value: category.id, label: category.name }));

  return (
    <div className="space-y-4">
      <Toolbar ariaLabel="Categorías por dependencia">
        <Select
          className="w-64"
          aria-label="Dependencia"
          value={moduleCode}
          onChange={(e) => setModuleCode(e.target.value)}
          options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
        />
        <div className="flex-1" />
        <Button variant="primary" onClick={() => openNew()} icon={<Plus className="h-4 w-4" />}>
          Nueva categoría
        </Button>
      </Toolbar>

      {categories.error ? (
        <ApiErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : categories.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState
          title="Sin categorías"
          description="Define las series y subseries documentales de esta dependencia."
          action={{ label: 'Crear categoría', onClick: () => openNew() }}
        />
      ) : (
        <ul className="space-y-1.5">
          {(categories.data ?? [])
            .filter((category) => category.parent_id === null)
            .map((category) => renderRow(category, 0))}
        </ul>
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          title={form.id ? 'Editar categoría' : 'Nueva categoría'}
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
            <FormField label="Nombre" required>
              <Input data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Descripción">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Dependencia" required>
                <Select
                  value={form.module_code}
                  onChange={(e) => setForm({ ...form, module_code: e.target.value, parent_id: '' })}
                  options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
                />
              </FormField>
              <FormField label="Categoría padre">
                <Select
                  placeholder="Sin padre (serie principal)"
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  options={parentOptions.filter((option) => option.value !== form.id)}
                />
              </FormField>
            </div>
            <FormField label="Color">
              <Input
                type="color"
                className="h-10 w-20 p-1"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}
