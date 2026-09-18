import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '@/api/auth';
import {
  ApiError,
  refreshAccessToken,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
} from '@/api/client';
import { clearQueryCache } from '@/hooks/useQuery';
import type { EffectiveModule, Me } from '@/types/api';

export interface AuthContextValue {
  user: Me | null;
  /** true mientras se resuelve la sesión inicial (refresh silencioso). */
  initializing: boolean;
  error: ApiError | null;
  /** Se incrementa cada vez que cambia el access token (para reabrir SSE). */
  tokenVersion: number;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;

  isAuthenticated: boolean;
  /** Debe cambiar la contraseña antes de usar la aplicación. */
  mustChangePassword: boolean;
  hasFullAccess: boolean;
  canManageUsers: boolean;
  /** Acceso a la sección de Administración. */
  isAdminArea: boolean;
  effectiveModules: EffectiveModule[];
  canRead: (moduleCode: string) => boolean;
  canWrite: (moduleCode: string) => boolean;

  /**
   * Características habilitadas para el rol del usuario (`effective_features`
   * de `GET /auth/me`). `null` cuando el servidor todavía no publica el campo:
   * en ese caso la interfaz **no** oculta nada, porque ocultar sin dato sería
   * inventar una restricción. La decisión vinculante es siempre del servidor.
   */
  effectiveFeatures: string[] | null;
  hasFeature: (code: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Renueva el token un poco antes de expirar para no interrumpir al usuario. */
const REFRESH_MARGIN_S = 60;

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<Me | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);
  const refreshTimer = useRef<number | undefined>(undefined);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    clearQueryCache();
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    try {
      sessionStorage.removeItem('eduarchive.catalogs');
    } catch {
      /* sessionStorage puede no estar disponible */
    }
  }, []);

  /** Programa el refresh silencioso antes de que caduque el access token. */
  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      const delay = Math.max(10, expiresIn - REFRESH_MARGIN_S) * 1000;
      refreshTimer.current = window.setTimeout(() => {
        void refreshAccessToken().then((token) => {
          if (token) {
            setTokenVersion((v) => v + 1);
            scheduleRefresh(expiresIn);
          } else {
            clearSession();
          }
        });
      }, delay);
    },
    [clearSession],
  );

  // Sesión forzada a cerrar desde el cliente HTTP (refresh agotado).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Al recargar la página se intenta refresh antes de mostrar el login.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Se usa `refreshSession` y no `authApi.refresh` porque comparte la
        // petición entre llamadas concurrentes. En desarrollo React monta el
        // efecto dos veces y, al rotar el servidor el token de refresco, la
        // segunda llamada llegaría con uno revocado y devolvería al login.
        const res = await refreshSession();
        if (cancelled) return;
        if (!res) {
          setAccessToken(null);
          return;
        }
        setAccessToken(res.accessToken);
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setTokenVersion((v) => v + 1);
        scheduleRefresh(res.expiresIn);
      } catch {
        if (!cancelled) setAccessToken(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      try {
        const res = await authApi.login(email, password);
        clearQueryCache();
        setUser(res.user);
        setTokenVersion((v) => v + 1);
        scheduleRefresh(res.expiresIn);
      } catch (err) {
        const apiError =
          err instanceof ApiError ? err : new ApiError('INTERNAL', 'No se pudo iniciar sesión.', 0);
        setError(apiError);
        throw apiError;
      }
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      /* el cierre local ocurre igual aunque el servidor falle */
    }
    clearSession();
  }, [clearSession]);

  const reloadMe = useCallback(async (): Promise<void> => {
    const me = await authApi.me();
    setUser(me);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      await authApi.changePassword(currentPassword, newPassword);
      await reloadMe();
    },
    [reloadMe],
  );

  const completeOnboarding = useCallback(async (): Promise<void> => {
    await authApi.markOnboardingDone();
    setUser((prev) => (prev ? { ...prev, onboarding_done: true } : prev));
  }, []);

  const effectiveModules = user?.effective_modules ?? [];
  const effectiveFeatures = user?.effective_features ?? null;

  const canRead = useCallback(
    (moduleCode: string): boolean => {
      if (!user) return false;
      if (user.role.has_full_access) return true;
      return effectiveModules.some((m) => m.code === moduleCode && m.can_read);
    },
    [user, effectiveModules],
  );

  const canWrite = useCallback(
    (moduleCode: string): boolean => {
      if (!user) return false;
      if (user.role.has_full_access) return true;
      return effectiveModules.some((m) => m.code === moduleCode && m.can_write);
    },
    [user, effectiveModules],
  );

  const featureSet = useMemo(
    () => (effectiveFeatures ? new Set(effectiveFeatures) : null),
    [effectiveFeatures],
  );

  const hasFeature = useCallback(
    (code: string): boolean => {
      if (!user) return false;
      // Sin catálogo publicado no se oculta nada: el servidor rechaza si toca.
      if (!featureSet) return true;
      return featureSet.has(code);
    },
    [user, featureSet],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      error,
      tokenVersion,
      login,
      logout,
      reloadMe,
      changePassword,
      completeOnboarding,
      isAuthenticated: user !== null,
      mustChangePassword: user?.must_change_password ?? false,
      hasFullAccess: user?.role.has_full_access ?? false,
      canManageUsers: user?.role.can_manage_users ?? false,
      isAdminArea: (user?.role.has_full_access ?? false) || (user?.role.can_manage_users ?? false),
      effectiveModules,
      canRead,
      canWrite,
      effectiveFeatures,
      hasFeature,
    }),
    [
      user,
      initializing,
      error,
      tokenVersion,
      login,
      logout,
      reloadMe,
      changePassword,
      completeOnboarding,
      effectiveModules,
      canRead,
      canWrite,
      effectiveFeatures,
      hasFeature,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
