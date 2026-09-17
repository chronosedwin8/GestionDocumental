import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  icon,
  breadcrumbs,
  actions,
}: PageHeaderProps): React.JSX.Element {
  return (
    <div className="mb-6">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-surface-raised">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-content-primary md:text-2xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-content-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
