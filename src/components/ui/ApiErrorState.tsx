import { AlertTriangle, Bot, HardDrive, Lock, ShieldAlert, WifiOff } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from './EmptyState';

export interface ApiErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
}

/**
 * Estado vacío coherente para los errores del contrato. `STORAGE_NOT_CONFIGURED`
 * y `AI_NOT_CONFIGURED` ofrecen enlace a Administración sólo si el usuario
 * puede entrar ahí; el resto de usuarios ve el mensaje sin enlace muerto.
 */
export function ApiErrorState({ error, onRetry, className }: ApiErrorStateProps): React.JSX.Element {
  const { isAdminArea } = useAuth();

  if (error.code === 'STORAGE_NOT_CONFIGURED') {
    return (
      <EmptyState
        className={className}
        tone="warning"
        icon={<HardDrive className="h-8 w-8" />}
        title="Almacenamiento sin configurar"
        description={
          isAdminArea
            ? 'El servidor todavía no tiene credenciales de S3. Configúralas para poder subir y descargar archivos.'
            : 'El almacenamiento del sistema aún no está configurado. Avisa al administrador para habilitarlo.'
        }
        action={isAdminArea ? { label: 'Ir a Administración', to: '/admin/almacenamiento' } : undefined}
      />
    );
  }

  if (error.code === 'AI_NOT_CONFIGURED') {
    return (
      <EmptyState
        className={className}
        tone="warning"
        icon={<Bot className="h-8 w-8" />}
        title="Asistente de IA no disponible"
        description={
          isAdminArea
            ? 'No hay clave de IA configurada en el servidor. Actívala para usar resúmenes, etiquetas y búsqueda semántica.'
            : 'El asistente de IA no está habilitado. Avisa al administrador si necesitas esta función.'
        }
        action={isAdminArea ? { label: 'Ir a Administración', to: '/admin/sistema' } : undefined}
      />
    );
  }

  if (error.code === 'FORBIDDEN') {
    return (
      <EmptyState
        className={className}
        icon={<Lock className="h-8 w-8" />}
        title="Sin permisos"
        description={error.message || 'No tienes acceso a este recurso.'}
      />
    );
  }

  /**
   * 409. Desde `server/CONTRACT_NOTES.md §9` lo devuelven la descarga de un
   * documento bloqueado (o de una de sus versiones), la transferencia fuera
   * de secuencia y las salvaguardas de gobierno sobre usuarios. El mensaje
   * del servidor es explícito, así que se muestra tal cual.
   */
  if (error.code === 'CONFLICT') {
    return (
      <EmptyState
        className={className}
        tone="warning"
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Acción no permitida en este estado"
        description={error.message || 'El estado actual del recurso no admite esta acción.'}
        action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
      />
    );
  }

  if (error.isNetwork) {
    return (
      <EmptyState
        className={className}
        tone="danger"
        icon={<WifiOff className="h-8 w-8" />}
        title="Sin conexión con el servidor"
        description="No se pudo contactar la API. Verifica que el servicio esté en ejecución."
        action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
      />
    );
  }

  return (
    <EmptyState
      className={className}
      tone="danger"
      icon={<AlertTriangle className="h-8 w-8" />}
      title="No se pudo cargar la información"
      description={error.message}
      action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
    />
  );
}
