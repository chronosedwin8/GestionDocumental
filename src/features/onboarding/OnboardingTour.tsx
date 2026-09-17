import { useState } from 'react';
import { Bell, FileUp, FolderOpen, Hash, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useHelp } from '@/contexts/HelpContext';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

interface Step {
  id: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  /** Artículo de `/help` que amplía el paso, si el administrador lo publicó. */
  helpSlug?: string;
}

/**
 * Tour inicial de 5 pasos (U10). El texto de cada paso es una sola frase de
 * interfaz; la explicación extensa vive en `/help` y se abre con "Ampliar".
 */
const STEPS: Step[] = [
  {
    id: 'subir',
    title: 'Sube documentos',
    body: 'El asistente de carga toma los archivos, calcula su huella SHA-256 y los guarda en el archivo institucional.',
    icon: <FileUp className="h-5 w-5" aria-hidden />,
    helpSlug: 'primeros-pasos',
  },
  {
    id: 'clasificar',
    title: 'Clasifica y folia',
    body: 'Cada documento se clasifica con la tabla de retención de su dependencia y recibe folio y fecha de disposición.',
    icon: <Hash className="h-5 w-5" aria-hidden />,
    helpSlug: 'foliacion',
  },
  {
    id: 'buscar',
    title: 'Encuentra lo que necesitas',
    body: 'Busca por contenido, metadatos o en lenguaje natural; Ctrl+K abre la búsqueda global desde cualquier pantalla.',
    icon: <Search className="h-5 w-5" aria-hidden />,
    helpSlug: 'busqueda',
  },
  {
    id: 'expedientes',
    title: 'Agrupa en expedientes',
    body: 'Los expedientes reúnen los documentos de un trámite o de una persona: hojas de vida y expedientes académicos.',
    icon: <FolderOpen className="h-5 w-5" aria-hidden />,
    helpSlug: 'ciclo-documental',
  },
  {
    id: 'notificaciones',
    title: 'Mantente al día',
    body: 'Las notificaciones y la bandeja de pendientes avisan de retenciones, préstamos y solicitudes por resolver.',
    icon: <Bell className="h-5 w-5" aria-hidden />,
  },
];

/** Se muestra una sola vez por usuario (`users.onboarding_done`). */
export function OnboardingTour(): React.JSX.Element | null {
  const { user, completeOnboarding } = useAuth();
  const { settings } = useCatalogs();
  const { openHelp } = useHelp();
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const visible = user !== null && !user.onboarding_done && !dismissed;
  if (!visible) return null;

  const step = STEPS[index] as Step;
  const isLast = index === STEPS.length - 1;

  const finish = async (): Promise<void> => {
    setClosing(true);
    try {
      await completeOnboarding();
    } finally {
      setDismissed(true);
      setClosing(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => void finish()}
      size="md"
      title={`Bienvenido a ${settings?.app_name ?? 'EduArchive'}`}
      description={`Paso ${index + 1} de ${STEPS.length}`}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void finish()} disabled={closing}>
            Saltar
          </Button>
          <div className="flex-1" />
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)} disabled={closing}>
              Anterior
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            loading={closing}
            onClick={() => (isLast ? void finish() : setIndex(index + 1))}
          >
            {isLast ? 'Empezar' : 'Siguiente'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-acid-soft text-acid">
            {step.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base text-content-primary">{step.title}</h3>
            <p className="mt-1 text-sm text-content-secondary">{step.body}</p>
            {step.helpSlug && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 px-0"
                onClick={() => openHelp({ slug: step.helpSlug as string, contextLabel: step.title })}
              >
                Ampliar en la ayuda
              </Button>
            )}
          </div>
        </div>

        <ol className="flex justify-center gap-1.5" aria-label="Progreso del recorrido">
          {STEPS.map((entry, position) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-label={`Ir al paso ${position + 1}: ${entry.title}`}
                aria-current={position === index ? 'step' : undefined}
                onClick={() => setIndex(position)}
                className={cn(
                  'h-1.5 w-8 rounded-full transition-colors',
                  position === index ? 'bg-acid' : 'bg-surface-overlay hover:bg-line-strong',
                )}
              />
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
