import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BarChart2, Building2, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { AlertsTab } from './tabs/AlertsTab';
import { GeneralTab } from './tabs/GeneralTab';
import { ModuleTab } from './tabs/ModuleTab';
import { TrendsTab } from './tabs/TrendsTab';

type StatsTab = 'general' | 'tendencias' | 'alertas' | 'modulo';

const TABS = [
  { id: 'general', label: 'KPIs generales', icon: <BarChart2 className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'tendencias', label: 'Tendencias', icon: <TrendingUp className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'alertas', label: 'Alertas', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  { id: 'modulo', label: 'Por dependencia', icon: <Building2 className="h-3.5 w-3.5" aria-hidden /> },
];

export default function StatsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<StatsTab>(
    TABS.some((entry) => entry.id === tabParam) ? (tabParam as StatsTab) : 'general',
  );

  const change = (next: string): void => {
    setTab(next as StatsTab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description="Indicadores del archivo institucional calculados en el servidor."
        icon={<BarChart2 className="h-5 w-5 text-acid" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Estadísticas' }]}
        actions={<HelpButton contextLabel="Estadísticas" label="Ayuda de estadísticas" />}
      />

      <Tabs className="mb-5" items={TABS} value={tab} onChange={change} ariaLabel="Secciones de estadísticas" />

      <TabPanel id="general" active={tab === 'general'}>
        <GeneralTab />
      </TabPanel>
      <TabPanel id="tendencias" active={tab === 'tendencias'}>
        <TrendsTab />
      </TabPanel>
      <TabPanel id="alertas" active={tab === 'alertas'}>
        <AlertsTab />
      </TabPanel>
      <TabPanel id="modulo" active={tab === 'modulo'}>
        <ModuleTab />
      </TabPanel>
    </>
  );
}
