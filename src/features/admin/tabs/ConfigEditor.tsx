import { useState } from 'react';
import { Eye, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import * as systemApi from '@/api/system';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateTime } from '@/lib/format';
import type { SystemConfigItem } from '@/types/api';

/** Claves relacionadas con almacenamiento; el resto va a la pestaña Sistema. */
export function isStorageKey(key: string): boolean {
  return /^(aws|s3|storage)/i.test(key);
}

function isMasked(value: unknown): value is { masked: true; hint: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { masked?: unknown }).masked === true
  );
}

function displayValue(item: SystemConfigItem): string {
  if (isMasked(item.value)) return item.value.hint;
  if (item.value === null || item.value === undefined) return '';
  if (typeof item.value === 'string') return item.value;
  return JSON.stringify(item.value);
}

export interface ConfigEditorProps {
  items: SystemConfigItem[];
  onSaved: () => void | Promise<void>;
}

/** Editor genérico de `system_config` con secretos enmascarados. */
export function ConfigEditor({ items, onSaved }: ConfigEditorProps): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (item: SystemConfigItem): Promise<void> => {
    const raw = drafts[item.key];
    if (raw === undefined) return;

    setSaving(item.key);
    try {
      // Se intenta interpretar JSON (números, booleanos, objetos) y, si no, texto.
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
      await systemApi.setConfig(item.key, parsed);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
      await onSaved();
      toast.success(`"${item.key}" actualizado.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const draft = drafts[item.key];
        const masked = isMasked(item.value);
        return (
          <li key={item.key} className="rounded-lg border border-line bg-surface-sunken p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs text-content-primary">{item.key}</code>
              {item.is_secret && (
                <Badge color="var(--color-warning)">
                  <Eye className="h-3 w-3" aria-hidden />
                  Secreto
                </Badge>
              )}
              {item.updated_at && (
                <span className="text-[10px] text-content-muted">
                  Actualizado {formatDateTime(item.updated_at)}
                </span>
              )}
            </div>

            {item.description && <p className="mb-2 text-xs text-content-muted">{item.description}</p>}

            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[220px] flex-1"
                aria-label={`Valor de ${item.key}`}
                type={item.is_secret ? 'password' : 'text'}
                placeholder={masked ? `Actual: ${displayValue(item)}` : undefined}
                value={draft ?? (masked ? '' : displayValue(item))}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
              />
              <Button
                variant="primary"
                size="sm"
                loading={saving === item.key}
                disabled={draft === undefined || draft === ''}
                onClick={() => void save(item)}
                icon={<Save className="h-3.5 w-3.5" />}
              >
                Guardar
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
