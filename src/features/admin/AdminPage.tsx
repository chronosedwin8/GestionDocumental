import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  BookUser,
  CalendarRange,
  Clock,
  Cloud,
  HelpCircle,
  LayoutList,
  Server,
  Settings,
  Shield,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/help/HelpButton';
import { Tabs } from '@/components/ui/Tabs';
import { AuditTab } from './tabs/AuditTab';
import { CatalogsTab } from './tabs/CatalogsTab';
import { CategoriesTab } from './tabs/CategoriesTab';
import { CustodyTab } from './tabs/CustodyTab';
import { DeletionsTab } from './tabs/DeletionsTab';
import { HelpTab } from './tabs/HelpTab';
import { LoansTab } from './tabs/LoansTab';
import { PeriodsTab } from './tabs/PeriodsTab';
import { RolesTab } from './tabs/RolesTab';
import { StorageTab } from './tabs/StorageTab';
import { SystemTab } from './tabs/SystemTab';
import { TrdTab } from './tabs/TrdTab';
import { UsersTab } from './tabs/UsersTab';

interface AdminTabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Sólo para roles con acceso total (no basta `can_manage_users`). */
  fullAccessOnly?: boolean;
  render: () => React.JSX.Element;
}

const TAB_DEFS: AdminTabDef[] = [
  {
    id: 'almacenamiento',
    label: 'Almacenamiento',
    icon: <Cloud className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <StorageTab />,
  },
  { id: 'usuarios', label: 'Usuarios', icon: <Users className="h-3.5 w-3.5" aria-hidden />, render: () => <UsersTab /> },
  {
    id: 'roles',
    label: 'Roles y permisos',
    icon: <Shield className="h-3.5 w-3.5" aria-hidden />,
    render: () => <RolesTab />,
  },
  {
    id: 'trd',
    label: 'TRD',
    icon: <Clock className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <TrdTab />,
  },
  {
    id: 'categorias',
    label: 'Categorías',
    icon: <Tag className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <CategoriesTab />,
  },
  {
    id: 'periodos',
    label: 'Periodos académicos',
    icon: <CalendarRange className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <PeriodsTab />,
  },
  {
    id: 'eliminaciones',
    label: 'Eliminaciones',
    icon: <Trash2 className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <DeletionsTab />,
  },
  {
    id: 'prestamos',
    label: 'Préstamos',
    icon: <BookOpen className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <LoansTab />,
  },
  {
    id: 'custodia',
    label: 'Custodia',
    icon: <BookUser className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <CustodyTab />,
  },
  {
    id: 'auditoria',
    label: 'Auditoría',
    icon: <Activity className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <AuditTab />,
  },
  {
    id: 'catalogos',
    label: 'Catálogos',
    icon: <LayoutList className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <CatalogsTab />,
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: <Server className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <SystemTab />,
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden />,
    fullAccessOnly: true,
    render: () => <HelpTab />,
  },
];

export default function AdminPage(): React.JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { hasFullAccess, canManageUsers, isAdminArea } = useAuth();

  if (!isAdminArea) return <Navigate to="/" replace />;

  const available = TAB_DEFS.filter((entry) =>
    entry.fullAccessOnly ? hasFullAccess : hasFullAccess || canManageUsers,
  );

  const current = available.find((entry) => entry.id === tab) ?? available[0];
  if (!current) return <Navigate to="/" replace />;

  if (!tab || !available.some((entry) => entry.id === tab)) {
    return <Navigate to={`/admin/${current.id}`} replace />;
  }

  return (
    <>
      <PageHeader
        title="Administración"
        description="Configuración del sistema, usuarios, permisos y catálogos."
        icon={<Settings className="h-5 w-5 text-state-danger" aria-hidden />}
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: current.label }]}
        actions={
          <HelpButton
            slug="puesta-en-marcha-admin"
            contextLabel="Administración"
            label="Ayuda de administración"
          />
        }
      />

      <Tabs
        className="mb-5"
        ariaLabel="Secciones de administración"
        value={current.id}
        onChange={(id) => navigate(`/admin/${id}`)}
        items={available.map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon }))}
      />

      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
        {current.render()}
      </div>
    </>
  );
}
