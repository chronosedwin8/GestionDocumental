import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CommercialItemInput, LicensePlan } from '@/types/api';

export interface LineItemsEditorProps {
  items: CommercialItemInput[];
  onChange: (items: CommercialItemInput[]) => void;
  plans: LicensePlan[];
  disabled?: boolean;
}

export const EMPTY_LINE: CommercialItemInput = {
  description: '',
  plan_code: null,
  quantity: 1,
  unit_price: 0,
};

/**
 * Editor de líneas de una cotización o factura.
 *
 * No muestra ningún total: subtotal, impuesto y total los calcula y los
 * devuelve el servidor (`docs/FACTURACION.md §4`). Aquí solo se capturan
 * descripción, plan, cantidad y precio unitario.
 */
export function LineItemsEditor({
  items,
  onChange,
  plans,
  disabled = false,
}: LineItemsEditorProps): React.JSX.Element {
  const update = (index: number, patch: Partial<CommercialItemInput>): void => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <fieldset className="space-y-2 rounded-lg border border-line p-3" disabled={disabled}>
      <legend className="px-1 text-xs font-medium text-content-secondary">Líneas</legend>

      {items.length === 0 && (
        <p className="text-[11px] text-content-muted">
          Añade al menos una línea. El total lo calcula el servidor al guardar.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={index}
            className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface-sunken p-2 sm:grid-cols-12"
          >
            <div className="sm:col-span-5">
              <Input
                aria-label={`Descripción de la línea ${index + 1}`}
                placeholder="Descripción"
                value={item.description}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3">
              <Select
                aria-label={`Plan de la línea ${index + 1}`}
                placeholder="Sin plan"
                value={item.plan_code ?? ''}
                onChange={(e) => {
                  const code = e.target.value || null;
                  const plan = plans.find((entry) => entry.code === code);
                  update(index, {
                    plan_code: code,
                    ...(plan
                      ? {
                          description: item.description || plan.name,
                          // El precio del plan puede ser "a la medida" (null):
                          // en ese caso no se rellena nada.
                          ...(plan.price_amount !== null
                            ? { unit_price: Number(plan.price_amount) }
                            : {}),
                        }
                      : {}),
                  });
                }}
                options={plans.map((plan) => ({ value: plan.code, label: plan.name }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                type="number"
                min={1}
                step={1}
                aria-label={`Cantidad de la línea ${index + 1}`}
                value={item.quantity}
                onChange={(e) => update(index, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2 flex gap-1">
              <Input
                type="number"
                min={0}
                step={1}
                aria-label={`Precio unitario de la línea ${index + 1}`}
                value={item.unit_price}
                onChange={(e) => update(index, { unit_price: Number(e.target.value) })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Quitar la línea ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                icon={<Trash2 className="h-4 w-4 text-state-danger" />}
              />
            </div>
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="outline"
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => onChange([...items, { ...EMPTY_LINE }])}
      >
        Añadir línea
      </Button>
    </fieldset>
  );
}
