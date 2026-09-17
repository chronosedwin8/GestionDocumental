import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Archive, CheckCircle2 } from 'lucide-react';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

/** Restablecimiento con el token recibido por correo (`/reset/:token`). */
export default function ResetPasswordPage(): React.JSX.Element {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (password !== confirmValue) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo restablecer la contraseña. Solicita un enlace nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-acid-border bg-acid-soft">
            <Archive className="h-8 w-8 text-acid" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-bold text-content-primary">Nueva contraseña</h1>
        </div>

        {done ? (
          <div className="rounded-card border border-state-success/40 bg-state-success/10 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-state-success" aria-hidden />
            <p className="text-sm text-content-primary">Contraseña actualizada.</p>
            <p className="mt-1 text-xs text-content-muted">Redirigiendo al inicio de sesión…</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-4 rounded-card border border-line bg-surface-raised p-6"
          >
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-xs text-state-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <FormField label="Nueva contraseña" required>
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>

            <FormField label="Repite la contraseña" required>
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={confirmValue}
                onChange={(e) => setConfirmValue(e.target.value)}
              />
            </FormField>

            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              Guardar
            </Button>

            <p className="text-center text-xs">
              <Link to="/login" className="text-content-muted no-underline hover:text-acid">
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
