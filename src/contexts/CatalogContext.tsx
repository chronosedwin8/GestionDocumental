/**
 * Catálogos del sistema. Sustituye a las tablas de etiquetas, colores,
 * roles, estados y disposiciones que antes estaban escritas a mano: nada se
 * declara en el cliente, todo llega de `GET /catalogs`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getCatalogs } from '@/api/catalogs';
import { getFeatureCatalog } from '@/api/features';
import { ApiError } from '@/api/client';
import type {
  Catalogs,
  CorrespondenceType,
  Disposition,
  DocumentStatus,
  Feature,
  FeatureCategory,
  Module,
  NotificationType,
  PersonType,
  PublicSettings,
  Role,
} from '@/types/api';

const STORAGE_KEY = 'eduarchive.catalogs';

export interface CatalogContextValue {
  catalogs: Catalogs | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;

  modules: Module[];
  /** Módulos activos ordenados por `sort_order`. */
  activeModules: Module[];
  roles: Role[];
  statuses: DocumentStatus[];
  dispositions: Disposition[];
  notificationTypes: NotificationType[];
  correspondenceTypes: CorrespondenceType[];
  personTypes: PersonType[];
  settings: PublicSettings | null;
  /** Catálogo de características por rol (`docs/PERMISOS_Y_USUARIOS.md §4`). */
  features: Feature[];
  featureCategories: FeatureCategory[];

  module: (code: string | null | undefined) => Module | undefined;
  moduleLabel: (code: string | null | undefined) => string;
  moduleColor: (code: string | null | undefined) => string;
  moduleIcon: (code: string | null | undefined) => string;
  moduleDescription: (code: string | null | undefined) => string;
  role: (code: string | null | undefined) => Role | undefined;
  roleLabel: (code: string | null | undefined) => string;
  status: (code: string | null | undefined) => DocumentStatus | undefined;
  statusLabel: (code: string | null | undefined) => string;
  statusColor: (code: string | null | undefined) => string;
  disposition: (code: string | null | undefined) => Disposition | undefined;
  dispositionLabel: (code: string | null | undefined) => string;
  dispositionColor: (code: string | null | undefined) => string;
  notificationType: (code: string | null | undefined) => NotificationType | undefined;
  correspondenceType: (code: string | null | undefined) => CorrespondenceType | undefined;
  personTypeLabel: (code: string | null | undefined) => string;
  feature: (code: string | null | undefined) => Feature | undefined;
  featureLabel: (code: string | null | undefined) => string;
  featureCategory: (code: string | null | undefined) => FeatureCategory | undefined;
  featureCategoryLabel: (code: string | null | undefined) => string;
  /** Características de una categoría, ordenadas por `sort_order`. */
  featuresOfCategory: (categoryCode: string) => Feature[];
  /**
   * Siguiente estado de la secuencia archivística según `sort_order`, igual
   * que `catalogs.nextArchivalStatus()` del servidor. Sirve para **mostrar**
   * el destino de una transferencia, nunca para imponerlo: el servidor decide.
   */
  nextArchivalStatus: (code: string | null | undefined) => DocumentStatus | undefined;
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

/** Color por defecto cuando el catálogo no trae uno: gris neutro del tema. */
const FALLBACK_COLOR = '#a1a1aa';
const FALLBACK_ICON = 'Folder';

function readCache(): Catalogs | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Catalogs) : null;
  } catch {
    return null;
  }
}

function writeCache(catalogs: Catalogs): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(catalogs));
  } catch {
    /* modo privado o cuota llena: la cache en memoria basta */
  }
}

export function CatalogProvider({
  enabled,
  children,
}: {
  /** Sólo se cargan los catálogos tras autenticar. */
  enabled: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const [catalogs, setCatalogs] = useState<Catalogs | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCatalogs(signal);
      // `GET /catalogs` debe traer `features` y `feature_categories`
      // (PERMISOS §4). Mientras el servidor no los publique se piden a
      // `GET /features`, que cualquier autenticado puede leer. Si tampoco
      // existe, la interfaz se queda sin catálogo de características y
      // `useFeature` no oculta nada por su cuenta.
      let merged = data;
      if (!data.features || !data.feature_categories) {
        try {
          const catalog = await getFeatureCatalog(signal);
          merged = {
            ...data,
            features: data.features ?? catalog.features,
            feature_categories: data.feature_categories ?? catalog.categories,
          };
        } catch (featureError) {
          if (featureError instanceof DOMException && featureError.name === 'AbortError') return;
        }
      }
      setCatalogs(merged);
      writeCache(merged);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiError
          ? err
          : new ApiError('INTERNAL', 'No se pudieron cargar los catálogos.', 0),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCatalogs(null);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const reload = useCallback(() => load(), [load]);

  const value = useMemo<CatalogContextValue>(() => {
    const modules = catalogs?.modules ?? [];
    const roles = catalogs?.roles ?? [];
    const statuses = catalogs?.document_statuses ?? [];
    const dispositions = catalogs?.dispositions ?? [];
    const notificationTypes = catalogs?.notification_types ?? [];
    const correspondenceTypes = catalogs?.correspondence_types ?? [];
    const personTypes = catalogs?.person_types ?? [];
    const features = [...(catalogs?.features ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const featureCategories = [...(catalogs?.feature_categories ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    const moduleMap = new Map(modules.map((m) => [m.code, m]));
    const roleMap = new Map(roles.map((r) => [r.code, r]));
    const statusMap = new Map(statuses.map((s) => [s.code, s]));
    const dispositionMap = new Map(dispositions.map((d) => [d.code, d]));
    const notificationMap = new Map(notificationTypes.map((n) => [n.code, n]));
    const correspondenceMap = new Map(correspondenceTypes.map((c) => [c.code, c]));
    const personTypeMap = new Map(personTypes.map((p) => [p.code, p]));
    const featureMap = new Map(features.map((f) => [f.code, f]));
    const featureCategoryMap = new Map(featureCategories.map((c) => [c.code, c]));
    const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order);

    const get = <T,>(map: Map<string, T>, code: string | null | undefined): T | undefined =>
      code ? map.get(code) : undefined;

    return {
      catalogs,
      loading,
      error,
      reload,
      modules,
      activeModules: modules.filter((m) => m.is_active).sort((a, b) => a.sort_order - b.sort_order),
      roles,
      statuses: sortedStatuses,
      dispositions,
      notificationTypes,
      correspondenceTypes,
      personTypes,
      settings: catalogs?.settings ?? null,
      features,
      featureCategories,

      module: (code) => get(moduleMap, code),
      moduleLabel: (code) => get(moduleMap, code)?.name ?? code ?? '—',
      moduleColor: (code) => get(moduleMap, code)?.color ?? FALLBACK_COLOR,
      moduleIcon: (code) => get(moduleMap, code)?.icon ?? FALLBACK_ICON,
      moduleDescription: (code) => get(moduleMap, code)?.description ?? '',
      role: (code) => get(roleMap, code),
      roleLabel: (code) => get(roleMap, code)?.name ?? code ?? '—',
      status: (code) => get(statusMap, code),
      statusLabel: (code) => get(statusMap, code)?.name ?? code ?? '—',
      statusColor: (code) => get(statusMap, code)?.color ?? FALLBACK_COLOR,
      disposition: (code) => get(dispositionMap, code),
      dispositionLabel: (code) => get(dispositionMap, code)?.name ?? code ?? '—',
      dispositionColor: (code) => get(dispositionMap, code)?.color ?? FALLBACK_COLOR,
      notificationType: (code) => get(notificationMap, code),
      correspondenceType: (code) => get(correspondenceMap, code),
      personTypeLabel: (code) => get(personTypeMap, code)?.name ?? code ?? '—',
      feature: (code) => get(featureMap, code),
      featureLabel: (code) => get(featureMap, code)?.name ?? code ?? '—',
      featureCategory: (code) => get(featureCategoryMap, code),
      featureCategoryLabel: (code) => get(featureCategoryMap, code)?.name ?? code ?? '—',
      featuresOfCategory: (categoryCode) =>
        features.filter((entry) => entry.category_code === categoryCode),
      nextArchivalStatus: (code) => {
        if (!code) return undefined;
        const index = sortedStatuses.findIndex((entry) => entry.code === code);
        if (index === -1) return undefined;
        return sortedStatuses[index + 1];
      },
    };
  }, [catalogs, loading, error, reload]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalogs(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalogs debe usarse dentro de <CatalogProvider>.');
  return ctx;
}
