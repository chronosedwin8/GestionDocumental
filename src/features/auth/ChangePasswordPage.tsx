import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, KeyRound } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

/**
 * Se usa tanto de forma voluntaria como forzada cuando
 * `must_change_password` es verdadero (el router redirige aquí).
 */
export default function ChangePasswordPage(): React.JSX.Element {
  const { changePassword, mustChangePassword, logout } = useAuth();
  const { settings } = useCatalogs();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const minLength = settings?.password_min_length ?? 8;

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (next.length < minLength) {
      setError(`La nueva contraseña debe tener al menos ${minLength} caracteres.`);
      return;
    }
    if (next !== confirmValue) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (next === current) {
      setError('La nueva contraseña debe ser distinta de la actual.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(current, next);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-card border border-line bg-surface-raised p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-acid-border bg-acid-soft">
          <KeyRound className="h-5 w-5 text-acid" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-lg text-content-primary">Cambiar contraseña</h1>
          {mustChangePassword && (
            <p className="text-xs text-state-warning">
              Debes definir una contraseña propia antes de continuar.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-xs text-state-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <FormField label="Contraseña actual" required>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </FormField>

      <FormField label="Nueva contraseña" required hint={`Mínimo ${minLength} caracteres.`}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={minLength}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </FormField>

      <FormField label="Repite la nueva contraseña" required>
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirmValue}
          onChange={(e) => setConfirmValue(e.target.value)}
        />
      </FormField>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={submitting} className="flex-1">
          Guardar contraseña
        </Button>
        {mustChangePassword && (
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
        )}
      </div>
    </form>
  );

  if (mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base p-4">
        <div className="w-full max-w-md">{content}</div>
      </div>
    );
  }

  return <div className="mx-auto w-full max-w-md">{content}</div>;
}
