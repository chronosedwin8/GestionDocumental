import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CheckCircle2, ClipboardList } from 'lucide-react';
import * as categoriesApi from '@/api/categories';
import * as peopleApi from '@/api/people';
import * as trdApi from '@/api/trd';
import * as usersApi from '@/api/users';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useHelp } from '@/contexts/HelpContext';
import { useQuery } from '@/hooks/useQuery';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  to: string;
}

/**
 * Checklist de puesta en marcha para el administrador (P9). Cada punto se
 * calcula con datos reales de la API; la tarjeta desaparece al completarse.
 */
export function SetupChecklist(): React.JSX.Element | null {
  const { hasFullAccess } = useAuth();
  const { settings } = useCatalogs();
  const { openHelp } = useHelp();

  const users = useQuery(hasFullAccess ? 'setup:users' : null, (signal) =>
    usersApi.listUsers({ pageSize: 1 }, signal),
  );
  const rules = useQuery(hasFullAccess ? 'setup:trd' : null, (signal) =>
    trdApi.listRules(undefined, signal),
  );
  const categories = useQuery(hasFullAccess ? 'setup:categories' : null, (signal) =>
    categoriesApi.listCategories(undefined, true, signal),
  );
  const people = useQuery(hasFullAccess ? 'setup:people' : null, (signal) =>
    peopleApi.listPeople({ pageSize: 1 }, signal),
  );

  const loading =
    users.loading || rules.loading || categories.loading || people.loading || settings === null;

  const items = useMemo<ChecklistItem[]>(() => {
    if (!settings) return [];
    return [
      {
        key: 's3',
        label: 'Almacenamiento S3',
        hint: 'Sin S3 no se pueden subir ni descargar archivos.',
        done: settings.storage_configured,
        to: '/admin/almacenamiento',
      },
      {
        key: 'smtp',
        label: 'Correo saliente (SMTP)',
        hint: 'Necesario para avisos y recuperación de contraseña.',
        done: settings.smtp_configured,
        to: '/admin/sistema',
      },
      {
        key: 'users',
        label: 'Usuarios del colegio',
        hint: 'Crea las cuentas del personal con su rol y dependencia.',
        done: (users.data?.total ?? 0) > 1,
        to: '/admin/usuarios',
      },
      {
        key: 'trd',
        label: 'Tablas de retención (TRD)',
        hint: 'Definen la retención y la disposición de cada tipo documental.',
        done: (rules.data?.length ?? 0) > 0,
        to: '/admin/trd',
      },
      {
        key: 'categories',
        label: 'Categorías documentales',
        hint: 'Organizan los documentos dentro de cada dependencia.',
        done: (categories.data?.length ?? 0) > 0,
        to: '/admin/categorias',
      },
      {
        key: 'people',
        label: 'Personas registradas',
        hint: 'Empleados y estudiantes abren su expediente automáticamente.',
        done: (people.data?.total ?? 0) > 0,
        to: '/personas',
      },
    ];
  }, [settings, users.data, rules.data, categories.data, people.data]);

  if (!hasFullAccess) return null;

  if (loading) {
    return (
      <section className="panel">
        <Skeleton className="h-6 w-56" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </section>
    );
  }

  const pending = items.filter((item) => !item.done);
  if (items.length === 0 || pending.length === 0) return null;

  const done = items.length - pending.length;

  return (
    <section className="panel border-acid-border" aria-labelledby="puesta-en-marcha-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="puesta-en-marcha-title"
          className="flex items-center gap-2 font-display text-base text-content-primary"
        >
          <ClipboardList className="h-4 w-4 text-acid" aria-hidden />
          Puesta en marcha ({done} de {items.length})
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openHelp({ slug: 'puesta-en-marcha-admin', contextLabel: 'Puesta en marcha' })}
        >
          Ver guía completa
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-sunken px-3 py-2 no-underline transition-colors hover:border-acid-border hover:no-underline"
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-state-success" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block text-sm text-content-primary">
                  {item.label}
                  <span className="sr-only">{item.done ? ' (completado)' : ' (pendiente)'}</span>
                </span>
                <span className="block text-[11px] text-content-muted">{item.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
