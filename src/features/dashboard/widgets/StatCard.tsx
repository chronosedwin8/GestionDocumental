import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent: string;
  hint?: string;
  to?: string;
}

export function StatCard({ label, value, icon, accent, hint, to }: StatCardProps): React.JSX.Element {
  const body = (
    <div className="panel h-full p-4 transition-colors hover:border-[color:var(--border-strong)]">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-[11px] uppercase tracking-wide text-content-muted">{label}</p>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        >
          {icon}
        </span>
      </div>
      <p className="font-display text-2xl font-bold text-content-primary">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-content-muted">{hint}</p>}
    </div>
  );

  if (!to) return body;

  return (
    <Link to={to} className="block no-underline hover:no-underline">
      {body}
    </Link>
  );
}
