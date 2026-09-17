import { useState } from 'react';
import { Activity, CheckCircle2, Mail, PlayCircle, Server, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import * as systemApi from '@/api/system';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import { ConfigEditor, isStorageKey } from './ConfigEditor';

function HealthRow({ label, ok }: { label: string; ok: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface-sunken px-3 py-2">
      <span className="text-sm text-content-secondary">{label}</span>
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-state-success" aria-label="Correcto" />
      ) : (
        <XCircle className="h-4 w-4 text-state-danger" aria-label="No disponible" />
      )}
    </div>
  );
}

export function SystemTab(): React.JSX.Element {
  const { reload } = useCatalogs();
  const health = useQuery('system:health', (signal) => systemApi.health(signal));
  const jobs = useQuery('system:jobs', (signal) => systemApi.listJobs(signal));
  const config = useQuery('system:config', (signal) => systemApi.getConfig(signal));

  const [smtpTo, setSmtpTo] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const runJob = async (job: string): Promise<void> => {
    setRunningJob(job);
    try {
      const run = await systemApi.runJob(job);
      await jobs.refetch();
      toast.success(`Job "${job}" ejecutado (${run.status}).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo ejecutar el job.');
    } finally {
      setRunningJob(null);
    }
  };

  const testSmtp = async (): Promise<void> => {
    if (!smtpTo.trim()) return;
    setTestingSmtp(true);
    try {
      const result = await systemApi.testSmtp(smtpTo.trim());
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar el correo de prueba.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const configItems = (config.data ?? []).filter((item) => !isStorageKey(item.key));

  return (
    <div className="space-y-5">
      <section className="panel">
        <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <Server className="h-4 w-4 text-acid" aria-hidden />
          Salud del sistema
        </h2>
        {health.error ? (
          <ApiErrorState error={health.error} onRetry={() => void health.refetch()} />
        ) : health.loading || !health.data ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge color={health.data.status === 'ok' ? 'var(--color-success)' : 'var(--color-warning)'}>
                {health.data.status === 'ok' ? 'Operativo' : 'Degradado'}
              </Badge>
              <span className="text-xs text-content-muted">
                v{health.data.version} · en ejecución {Math.floor(health.data.uptime_s / 60)} min
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <HealthRow label="Base de datos" ok={health.data.db} />
              <HealthRow label="Almacenamiento S3" ok={health.data.storage_configured} />
              <HealthRow label="Asistente de IA" ok={health.data.ai_configured} />
              <HealthRow label="Correo (SMTP)" ok={health.data.smtp_configured} />
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <Activity className="h-4 w-4 text-acid" aria-hidden />
          Tareas programadas
        </h2>
        {jobs.error ? (
          <ApiErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : jobs.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="text-sm text-content-muted">El servidor no expone tareas programadas.</p>
        ) : (
          <ul className="space-y-2">
            {(jobs.data ?? []).map((job) => (
              <li
                key={job.job}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-sunken p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-content-primary">{job.job}</p>
                  <p className="text-[11px] text-content-muted">
                    Programación: <code>{job.schedule}</code>
                    {job.last_run && (
                      <>
                        {' · última ejecución '}
                        {formatDateTime(job.last_run.started_at)}
                      </>
                    )}
                  </p>
                </div>
                {job.last_run && (
                  <Badge
                    color={
                      job.last_run.status === 'OK'
                        ? 'var(--color-success)'
                        : job.last_run.status === 'ERROR'
                          ? 'var(--color-danger)'
                          : 'var(--color-info)'
                    }
                  >
                    {job.last_run.status}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  loading={runningJob === job.job}
                  onClick={() => void runJob(job.job)}
                  icon={<PlayCircle className="h-3.5 w-3.5" />}
                >
                  Ejecutar ahora
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="mb-4 flex items-center gap-2 font-display text-base text-content-primary">
          <Mail className="h-4 w-4 text-acid" aria-hidden />
          Prueba de correo
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Enviar correo de prueba a" className="min-w-[240px] flex-1">
            <Input
              type="email"
              value={smtpTo}
              onChange={(e) => setSmtpTo(e.target.value)}
              placeholder="destinatario@colegioaleman.edu.co"
            />
          </FormField>
          <Button
            variant="outline"
            loading={testingSmtp}
            disabled={smtpTo.trim() === ''}
            onClick={() => void testSmtp()}
          >
            Enviar prueba
          </Button>
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-1 font-display text-base text-content-primary">Configuración</h2>
        <p className="mb-4 text-xs text-content-muted">
          Políticas de contraseñas, días de papelera, límites de archivo, SMTP, IA y horarios de las tareas.
        </p>
        {config.error ? (
          <ApiErrorState error={config.error} onRetry={() => void config.refetch()} />
        ) : config.loading ? (
          <Skeleton className="h-48 w-full" />
        ) : configItems.length === 0 ? (
          <p className="text-sm text-content-muted">No hay parámetros configurables.</p>
        ) : (
          <ConfigEditor
            items={configItems}
            onSaved={async () => {
              await config.refetch();
              await reload();
            }}
          />
        )}
      </section>
    </div>
  );
}
