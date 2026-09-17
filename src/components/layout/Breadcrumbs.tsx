import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }): React.JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Ruta de navegación" className="mb-1">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-content-muted">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden />}
            <li className="min-w-0">
              {item.to && index < items.length - 1 ? (
                <Link to={item.to} className="truncate text-content-muted no-underline hover:text-content-primary">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-content-secondary" aria-current={index === items.length - 1 ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
