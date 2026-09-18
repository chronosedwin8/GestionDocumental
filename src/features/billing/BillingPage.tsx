import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  FileText,
  Package,
  Receipt,
  Users,
} from 'lucide-react';
import * as billingApi from '@/api/billing';
import * as systemApi from '@/api/system';
import { useQuery } from '@/hooks/useQuery';
import { useFeature } from '@/hooks/useFeature';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { DIAN_NOTICE } from './labels';
import { ClientsTab } from './tabs/ClientsTab';
import { InvoicesTab } from './tabs/InvoicesTab';
import { LicensesTab } from './tabs/LicensesTab';
import { QuotesTab } from './tabs/QuotesTab';
import { SummaryTab } from './tabs/SummaryTab';
import type { BillingSettings, SystemConfigItem } from '@/types/api';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'clientes', label: 'Clientes', icon: <Users className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: <FileText className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'facturas', label: 'Facturas', icon: <Receipt className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'licencias', label: 'Licencias y planes', icon: <Package className="h-3.5 w-3.5" aria-hidden /> },
];

/** Lee `system_config.billing` sin inventar valores por defecto. */
export function readBillingSettings(rows: SystemConfigItem[] | undefined): Partial<BillingSettings> {
  const row = rows?.find((entry) => entry.key === 'billing');
  if (!row || typeof row.value !== 'object' || row.value === null) return {};
  return row.value as Partial<BillingSettings>;
}

export default function BillingPage(): React.JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const canView = useFeature('BILLING_VIEW');

  // Datos compartidos por varias pestañas: clientes y planes.
  const clients = useQuery(
    canView ? 'billing:clients:all' : null,
    (signal) => billingApi.listClients({ pageSize: 200, sort: 'name', order: 'asc' }, signal),
  );
  const plans = useQuery(canView ? 'billing:plans' : null, (signal) =>
    billingApi.listLicensePlans(signal),
  );
  // El impuesto y los plazos por defecto salen de `system_config.billing`.
  const config = useQuery(canView ? 'system:config' : null, (signal) => systemApi.getConfig(signal));

  const billing = useMemo(() => readBillingSettings(config.data), [config.data]);
  const defaults = useMemo(
    () => ({
      tax_rate: typeof billing.tax_rate === 'number' ? billing.tax_rate : null,
      payment_terms_days:
        typeof billing.payment_terms_days === 'number' ? billing.payment_terms_days : null,
      quote_validity_days:
        typeof billing.quote_validity_days === 'number' ? billing.quote_validity_days : null,
    }),
    [billing],
  );

  if (!canView) {
    return (
      <EmptyState
        title="Sección no disponible"
        description="Tu rol no tiene la característica BILLING_VIEW. Pídesela al administrador si necesitas el panel comercial."
        action={{ label: 'Volver al panel', to: '/' }}
      />
    );
  }

  const current = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  if (!current) return <Navigate to="/" replace />;
  if (!tab) return <Navigate to={`/comercial/${current.id}`} replace />;
  if (!TABS.some((entry) => entry.id === tab)) {
    return <Navigate to={`/comercial/${TABS[0]?.id ?? 'resumen'}`} replace />;
  }

  const clientList = clients.data?.data ?? [];
  const planList = plans.data ?? [];

  return (
    <>
      <PageHeader
        title="Comercial"
        description="Clientes, cotizaciones, facturas, pagos y licencias de EduArchive."
        icon={<Briefcase className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Comercial' }, { label: current.label }]}
      />

      <p className="mb-4 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[11px] text-content-muted">
        {DIAN_NOTICE}
      </p>

      <Tabs
        className="mb-5"
        ariaLabel="Secciones del panel comercial"
        value={current.id}
        onChange={(id) => navigate(`/comercial/${id}`)}
        items={TABS.map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon }))}
      />

      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
        {current.id === 'resumen' && <SummaryTab />}
        {current.id === 'clientes' && <ClientsTab />}
        {current.id === 'cotizaciones' && (
          <QuotesTab
            clients={clientList}
            plans={planList}
            defaults={{
              tax_rate: defaults.tax_rate,
              quote_validity_days: defaults.quote_validity_days,
            }}
          />
        )}
        {current.id === 'facturas' && (
          <InvoicesTab
            clients={clientList}
            plans={planList}
            defaults={{
              tax_rate: defaults.tax_rate,
              payment_terms_days: defaults.payment_terms_days,
            }}
          />
        )}
        {current.id === 'licencias' && (
          <LicensesTab
            clients={clientList}
            plans={planList}
            plansError={plans.error !== null}
            onPlansChanged={() => void plans.refetch()}
          />
        )}
      </div>
    </>
  );
}
