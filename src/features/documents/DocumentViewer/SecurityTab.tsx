import { useState } from 'react';
import { Fingerprint, Lock, ShieldCheck, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import * as documentsApi from '@/api/documents';
import { ApiError } from '@/api/client';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format';
import type { ApiDocument, DocumentPermission } from '@/types/api';

export interface SecurityTabProps {
  document: ApiDocument;
  canWrite: boolean;
  isAdmin: boolean;
  onLock: () => void;
  onUnlock: () => void;
  onApprove: () => void;
}

/**
 * Seguridad del documento: aprobación electrónica con hash (T10) — ya no se
 * llama "firma digital" porque no hay certificado.
 */
export function SecurityTab({
  document,
  canWrite,
  isAdmin,
  onLock,
  onUnlock,
  onApprove,
}: SecurityTabProps): React.JSX.Element {
  const { roleLabel, roles } = useCatalogs();
  const permissions = useQuery<DocumentPermission[]>(
    isAdmin ? `document:${document.id}:permissions` : null,
    () => documentsApi.listPermissions(document.id),
  );
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const isLocked = document.status_code === 'BLOQUEO_ADMIN';
  const isApproved = document.approved_at !== null;

  const togglePermission = async (
    permission: DocumentPermission,
    field: 'can_read' | 'can_write' | 'can_delete',
  ): Promise<void> => {
    setSavingRole(permission.role_code);
    try {
      const next = { ...permission, [field]: !permission[field] };
      const updated = await documentsApi.setPermission(document.id, next);
      permissions.setData(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el permiso.');
    } finally {
      setSavingRole(null);
    }
  };

  const rows: DocumentPermission[] =
    permissions.data ??
    roles.map((role) => ({
      role_code: role.code,
      can_read: false,
      can_write: false,
      can_delete: false,
    }));

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 font-display text-sm text-content-primary">Aprobación electrónica</h3>
        {isApproved ? (
          <div className="space-y-2">
            <Badge color="var(--color-success)">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Aprobado
            </Badge>
            <p className="text-xs text-content-muted">
              Aprobado el {formatDateTime(document.approved_at)}.
            </p>
            {document.approval_sha256 && (
              <p className="flex items-start gap-1.5 break-all font-mono text-[11px] text-content-secondary">
                <Fingerprint className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                {document.approval_sha256}
              </p>
            )}
            <p className="text-xs text-content-muted">
              La aprobación es irreversible y bloquea la edición del documento.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-content-muted">
              La aprobación sella el documento con su hash SHA-256 y fecha. No es una firma digital
              certificada: deja constancia de integridad y responsable.
            </p>
            {canWrite && (
              <Button variant="primary" size="sm" onClick={onApprove} icon={<ShieldCheck className="h-4 w-4" />}>
                Aprobar y cerrar
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 font-display text-sm text-content-primary">Bloqueo administrativo</h3>
        <p className="mb-3 text-sm text-content-muted">
          Impide editar o eliminar el documento mientras dure una auditoría o proceso legal. Es reversible.
        </p>
        {isAdmin ? (
          isLocked ? (
            <Button variant="outline" size="sm" onClick={onUnlock} icon={<Unlock className="h-4 w-4" />}>
              Desbloquear
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onLock} icon={<Lock className="h-4 w-4" />}>
              Bloquear
            </Button>
          )
        ) : (
          <p className="text-xs text-content-muted">Solo los administradores pueden bloquear documentos.</p>
        )}
      </section>

      {isAdmin && (
        <section className="rounded-card border border-line bg-surface-sunken p-4">
          <h3 className="mb-3 font-display text-sm text-content-primary">Permisos por rol</h3>
          {permissions.loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 text-left text-[10px] uppercase tracking-wide text-content-muted">
                      Rol
                    </th>
                    {(['can_read', 'can_write', 'can_delete'] as const).map((field) => (
                      <th
                        key={field}
                        scope="col"
                        className="py-2 text-center text-[10px] uppercase tracking-wide text-content-muted"
                      >
                        {field === 'can_read' ? 'Leer' : field === 'can_write' ? 'Escribir' : 'Eliminar'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((permission) => (
                    <tr key={permission.role_code} className="border-b border-line last:border-0">
                      <td className="py-2 text-content-secondary">{roleLabel(permission.role_code)}</td>
                      {(['can_read', 'can_write', 'can_delete'] as const).map((field) => (
                        <td key={field} className="py-2 text-center">
                          <input
                            type="checkbox"
                            className="accent-[color:var(--color-acid)]"
                            aria-label={`${field} para ${roleLabel(permission.role_code)}`}
                            checked={permission[field]}
                            disabled={savingRole === permission.role_code}
                            onChange={() => void togglePermission(permission, field)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
