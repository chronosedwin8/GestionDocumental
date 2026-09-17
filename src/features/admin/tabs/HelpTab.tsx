import { useState } from 'react';
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as helpApi from '@/api/help';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useDialogs } from '@/contexts/DialogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { MarkdownView } from '@/components/ui/MarkdownView';
import { formatDateTime } from '@/lib/format';
import type { HelpArticle } from '@/types/api';

interface ArticleForm {
  original_slug: string | null;
  slug: string;
  title: string;
  body_md: string;
  module_code: string;
  role_codes: string[];
  sort_order: string;
}

/** Editor de `help_articles` en markdown (F7/U10). */
export function HelpTab(): React.JSX.Element {
  const { activeModules, roles, moduleLabel } = useCatalogs();
  const { confirm } = useDialogs();
  const articles = useQuery('help:list', (signal) => helpApi.listHelp({}, signal));
  const [form, setForm] = useState<ArticleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const save = async (): Promise<void> => {
    if (!form || !form.slug.trim() || !form.title.trim()) {
      toast.error('El identificador y el título son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        body_md: form.body_md,
        module_code: form.module_code || null,
        role_codes: form.role_codes.length > 0 ? form.role_codes : null,
        sort_order: Number(form.sort_order) || 0,
      };
      if (form.original_slug) await helpApi.updateHelp(form.original_slug, payload);
      else await helpApi.createHelp(payload);

      await articles.refetch();
      setForm(null);
      toast.success('Artículo guardado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el artículo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (article: HelpArticle): Promise<void> => {
    const ok = await confirm({
      title: 'Eliminar artículo de ayuda',
      message: `Se eliminará "${article.title}".`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await helpApi.deleteHelp(article.slug);
      await articles.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el artículo.');
    }
  };

  if (articles.error) return <ApiErrorState error={articles.error} onRetry={() => void articles.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            setForm({
              original_slug: null,
              slug: '',
              title: '',
              body_md: '',
              module_code: '',
              role_codes: [],
              sort_order: '0',
            })
          }
        >
          Nuevo artículo
        </Button>
      </div>

      {articles.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (articles.data ?? []).length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="h-8 w-8" />}
          title="Sin artículos de ayuda"
          description="Escribe las guías por módulo y por rol que verán los usuarios dentro del sistema."
        />
      ) : (
        <ul className="space-y-2">
          {(articles.data ?? []).map((article) => (
            <li
              key={article.slug}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-3"
            >
              <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content-primary">{article.title}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
                  <code className="font-mono">{article.slug}</code>
                  {article.module_code && <Badge>{moduleLabel(article.module_code)}</Badge>}
                  {article.role_codes?.map((role) => <Badge key={role}>{role}</Badge>)}
                  <span>Actualizado {formatDateTime(article.updated_at)}</span>
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar ${article.title}`}
                onClick={() =>
                  setForm({
                    original_slug: article.slug,
                    slug: article.slug,
                    title: article.title,
                    body_md: article.body_md,
                    module_code: article.module_code ?? '',
                    role_codes: article.role_codes ?? [],
                    sort_order: String(article.sort_order),
                  })
                }
                icon={<Pencil className="h-4 w-4" />}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Eliminar ${article.title}`}
                onClick={() => void remove(article)}
                icon={<Trash2 className="h-4 w-4" />}
              />
            </li>
          ))}
        </ul>
      )}

      {form && (
        <Dialog
          open
          onClose={() => setForm(null)}
          dismissable={!saving}
          size="lg"
          title={form.original_slug ? 'Editar artículo de ayuda' : 'Nuevo artículo de ayuda'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPreview((v) => !v)}>
                {preview ? 'Editar' : 'Previsualizar'}
              </Button>
              <div className="flex-1" />
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Identificador (slug)" required>
                <Input
                  data-autofocus
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="carga-de-documentos"
                />
              </FormField>
              <FormField label="Título" required>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </FormField>
              <FormField label="Dependencia asociada">
                <Select
                  placeholder="General (todas)"
                  value={form.module_code}
                  onChange={(e) => setForm({ ...form, module_code: e.target.value })}
                  options={activeModules.map((module) => ({ value: module.code, label: module.name }))}
                />
              </FormField>
              <FormField label="Orden">
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </FormField>
            </div>

            <fieldset className="rounded-lg border border-line p-3">
              <legend className="px-1 text-xs font-medium text-content-secondary">Roles destinatarios</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {roles.map((role) => (
                  <label key={role.code} className="flex items-center gap-2 text-xs text-content-secondary">
                    <input
                      type="checkbox"
                      className="accent-[color:var(--color-acid)]"
                      checked={form.role_codes.includes(role.code)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          role_codes: e.target.checked
                            ? [...form.role_codes, role.code]
                            : form.role_codes.filter((code) => code !== role.code),
                        })
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-content-muted">
                Sin selección, el artículo es visible para todos los roles.
              </p>
            </fieldset>

            {preview ? (
              <div className="rounded-lg border border-line bg-surface-sunken p-4">
                <MarkdownView source={form.body_md} />
              </div>
            ) : (
              <FormField label="Contenido (markdown)">
                <Textarea
                  rows={12}
                  className="font-mono text-xs"
                  value={form.body_md}
                  onChange={(e) => setForm({ ...form, body_md: e.target.value })}
                />
              </FormField>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
