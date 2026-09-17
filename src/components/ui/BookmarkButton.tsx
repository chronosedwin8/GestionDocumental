import { Star } from 'lucide-react';
import { useBookmarks } from '@/hooks/useBookmarks';
import { Button } from './Button';

export interface BookmarkButtonProps {
  documentId: string;
  documentTitle?: string;
  size?: 'sm' | 'icon';
  withLabel?: boolean;
}

/** Marca o desmarca un documento como favorito (`/me/bookmarks`). */
export function BookmarkButton({
  documentId,
  documentTitle,
  size = 'icon',
  withLabel = false,
}: BookmarkButtonProps): React.JSX.Element {
  const { isBookmarked, toggle } = useBookmarks();
  const marked = isBookmarked(documentId);
  const suffix = documentTitle ? ` “${documentTitle}”` : '';

  return (
    <Button
      size={withLabel ? 'sm' : size}
      variant="outline"
      aria-pressed={marked}
      aria-label={marked ? `Quitar de favoritos${suffix}` : `Añadir a favoritos${suffix}`}
      onClick={() => void toggle(documentId)}
      icon={
        <Star
          className="h-4 w-4"
          aria-hidden
          {...(marked ? { fill: 'currentColor', style: { color: 'var(--color-acid)' } } : {})}
        />
      }
    >
      {withLabel ? (marked ? 'En favoritos' : 'Favorito') : undefined}
    </Button>
  );
}
