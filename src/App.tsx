import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CatalogProvider } from '@/contexts/CatalogContext';
import { DialogProvider } from '@/contexts/DialogContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { router } from '@/router';

/** Los catálogos sólo se piden una vez que hay sesión. */
function CatalogGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return <CatalogProvider enabled={isAuthenticated}>{children}</CatalogProvider>;
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CatalogGate>
          <DialogProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--surface-raised)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  fontSize: '13px',
                },
                success: { iconTheme: { primary: 'var(--color-acid)', secondary: '#000' } },
                error: { iconTheme: { primary: 'var(--color-danger)', secondary: '#fff' } },
              }}
            />
            <RouterProvider router={router} />
          </DialogProvider>
        </CatalogGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
