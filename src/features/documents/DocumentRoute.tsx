import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiErrorState } from '@/components/ui/ApiErrorState';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useDocument } from './useDocument';
import { DocumentViewer } from './DocumentViewer';

/**
 * Deep-link `/documentos/:id`: redirige al módulo del documento con el visor
 * abierto encima de la lista, para conservar el contexto de navegación.
 */
export default function DocumentRoute(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { document, loading, error, refetch } = useDocument(id);

  useEffect(() => {
    if (document) {
      navigate(`/modulos/${document.module_code}?doc=${document.id}`, { replace: true });
    }
  }, [document, navigate]);

  if (error) return <ApiErrorState error={error} onRetry={() => void refetch()} />;
  if (loading || !document) return <FullPageSpinner label="Abriendo documento…" />;

  // Se muestra mientras ocurre la redirección (evita un parpadeo vacío).
  return <DocumentViewer open documentId={id} onClose={() => navigate(-1)} />;
}
