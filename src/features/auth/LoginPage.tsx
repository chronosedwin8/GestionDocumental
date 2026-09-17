import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Archive, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { FullPageSpinner } from '@/components/ui/Spinner';

type Mode = 'login' | 'forgot';

/** Fondo con acentos de esquina y rejilla: identidad visual del sistema. */
function Backdrop(): React.JSX.Element {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.35]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(700px circle at 50% 30%, var(--color-acid-soft) 0%, transparent 60%)',
        }}
      />
      <div className="pointer-events-none absolute left-4 top-4 h-16 w-16" aria-hidden>
        <div className="absolute h-[2px] w-16 bg-gradient-to-r from-acid to-transparent" />
        <div className="absolute h-16 w-[2px] bg-gradient-to-b from-acid to-transparent" />
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 h-16 w-16" aria-hidden>
        <div className="absolute bottom-0 right-0 h-[2px] w-16 bg-gradient-to-l from-acid to-transparent" />
        <div className="absolute bottom-0 right-0 h-16 w-[2px] bg-gradient-to-t from-acid to-transparent" />
      </div>
    </>
  );
}

export default function LoginPage(): React.JSX.Element {
  const { login, isAuthenticated, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [mode]);

  if (initializing) return <FullPageSpinner label="Comprobando sesión…" />;
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        const from = (location.state as { from?: string } | null)?.from ?? '/';
        navigate(from, { replace: true });
      } else {
        await authApi.forgotPassword(email.trim());
        setSuccess(
          'Si el correo está registrado y el servidor tiene SMTP configurado, recibirás un enlace de recuperación. Si no, pide al administrador una contraseña temporal.',
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'ACCOUNT_LOCKED'
            ? 'Cuenta bloqueada por intentos fallidos. Contacta al administrador.'
            : err.code === 'RATE_LIMITED'
              ? 'Demasiados intentos. Espera un momento antes de volver a intentarlo.'
              : err.isNetwork
                ? 'No se pudo conectar con el servidor. Verifica que la API esté en ejecución.'
                : err.message,
        );
      } else {
        setError('Ha ocurrido un error inesperado.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-surface-base p-4">
      <Backdrop />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-acid-border bg-acid-soft">
            <Archive className="h-10 w-10 text-acid" aria-hidden />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-content-primary">EDUARCHIVE</h1>
          <p className="mt-1 font-display text-sm font-semibold tracking-[0.3em] text-acid">SGDEA</p>
          <p className="mt-2 text-xs text-content-muted">
            Sistema de Gestión Documental Electrónico de Archivo
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 rounded-card border border-line bg-surface-raised p-6 shadow-[var(--shadow-pop)]"
        >
          <h2 className="font-display text-base text-content-primary">
            {mode === 'login' ? 'Iniciar sesión' : 'Recuperar contraseña'}
          </h2>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-xs text-state-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-lg border border-state-success/40 bg-state-success/10 p-3 text-xs text-state-success"
            >
              {success}
            </div>
          )}

          <FormField label="Correo institucional" required>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@colegioaleman.edu.co"
              icon={<Mail className="h-4 w-4" />}
            />
          </FormField>

          {mode === 'login' && (
            <FormField label="Contraseña" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={<Lock className="h-4 w-4" />}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-content-muted hover:text-content-primary"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </FormField>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={submitting}
            icon={!submitting ? <ArrowRight className="h-4 w-4" /> : undefined}
          >
            {mode === 'login' ? 'Entrar' : 'Enviar enlace'}
          </Button>

          <div className="pt-1 text-center text-xs">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'forgot' : 'login')}
              className="text-content-muted underline-offset-2 hover:text-acid hover:underline"
            >
              {mode === 'login' ? '¿Olvidaste tu contraseña?' : 'Volver a iniciar sesión'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-[10px] text-content-muted">
          Corporación Cultural Colegio Alemán de Barranquilla
        </p>
      </div>
    </div>
  );
}
