import { lazy } from 'react';
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';

/* Code-splitting por ruta (F10). */
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const ChangePasswordPage = lazy(() => import('@/features/auth/ChangePasswordPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ModuleViewPage = lazy(() => import('@/features/documents/ModuleViewPage'));
const DocumentRoute = lazy(() => import('@/features/documents/DocumentRoute'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const ExpedientesPage = lazy(() => import('@/features/expedientes/ExpedientesPage'));
const PeoplePage = lazy(() => import('@/features/people/PeoplePage'));
const PersonDetailPage = lazy(() => import('@/features/people/PersonDetailPage'));
const ExpedienteDetail = lazy(() => import('@/features/expedientes/ExpedienteDetail'));
const TrdPage = lazy(() => import('@/features/trd/TrdPage'));
const TrashPage = lazy(() => import('@/features/trash/TrashPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const StatsPage = lazy(() => import('@/features/stats/StatsPage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const BillingPage = lazy(() => import('@/features/billing/BillingPage'));
const MyAccountPage = lazy(() => import('@/features/billing/MyAccountPage'));

/** Exige sesión válida y fuerza el cambio de contraseña cuando corresponde. */
function RequireAuth(): React.JSX.Element {
  const { isAuthenticated, initializing, mustChangePassword } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageSpinner label="Comprobando sesión…" />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (mustChangePassword && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  return <Outlet />;
}

/** Guarda de rol para la sección de administración. */
function RequireAdmin(): React.JSX.Element {
  const { isAdminArea } = useAuth();
  if (!isAdminArea) {
    return (
      <EmptyState
        title="Sin permisos"
        description="Esta sección está reservada para administradores."
        action={{ label: 'Volver al panel', to: '/' }}
      />
    );
  }
  return <Outlet />;
}

/**
 * Compatibilidad con la URL antigua `?openDoc=<id>`: redirige al deep-link
 * real `/documentos/:id`.
 */
function LegacyOpenDocRedirect(): React.JSX.Element | null {
  const location = useLocation();
  const openDoc = new URLSearchParams(location.search).get('openDoc');
  if (openDoc) return <Navigate to={`/documentos/${openDoc}`} replace />;
  return null;
}

function RootRedirects(): React.JSX.Element {
  const legacy = LegacyOpenDocRedirect();
  if (legacy) return legacy;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset/:token', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/cambiar-contrasena', element: <ChangePasswordPage /> },
      {
        element: <RootRedirects />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'modulos/:code', element: <ModuleViewPage /> },
              { path: 'documentos/:id', element: <DocumentRoute /> },
              { path: 'buscar', element: <SearchPage /> },
              { path: 'personas', element: <PeoplePage /> },
              { path: 'personas/:id', element: <PersonDetailPage /> },
              { path: 'expedientes', element: <ExpedientesPage /> },
              { path: 'expedientes/:id', element: <ExpedienteDetail /> },
              { path: 'trd', element: <TrdPage /> },
              { path: 'papelera', element: <TrashPage /> },
              { path: 'notificaciones', element: <NotificationsPage /> },
              { path: 'estadisticas', element: <StatsPage /> },
              { path: 'mi-perfil', element: <ProfilePage /> },
              // La sección comercial comprueba `BILLING_VIEW` dentro de la
              // página: la ruta existe siempre y explica por qué no se ve.
              { path: 'comercial', element: <BillingPage /> },
              { path: 'comercial/:tab', element: <BillingPage /> },
              { path: 'mi-cuenta', element: <MyAccountPage /> },
              {
                element: <RequireAdmin />,
                children: [
                  { path: 'admin', element: <AdminPage /> },
                  { path: 'admin/:tab', element: <AdminPage /> },
                ],
              },
              {
                path: '*',
                element: (
                  <EmptyState
                    title="Página no encontrada"
                    description="La dirección solicitada no existe en EduArchive."
                    action={{ label: 'Volver al panel', to: '/' }}
                  />
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]);
