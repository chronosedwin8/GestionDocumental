/**
 * Resolución de "qué es" el expediente de una persona sin escribir ni un
 * código a mano: los módulos de talento humano y académico se leen de la
 * configuración (`settings.hr_module_code` / `settings.academic_module_code`)
 * y, cuando `GET /catalogs` no los publica, de `GET /system/config` si el
 * usuario es administrador. La etiqueta final se decide comparando esos
 * códigos con el módulo real de los expedientes de la persona.
 */

import { useMemo } from 'react';
import * as systemApi from '@/api/system';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogs } from '@/contexts/CatalogContext';
import { useQuery } from '@/hooks/useQuery';
import type { Expediente, SystemConfigItem } from '@/types/api';

export interface InstitutionModules {
  hrModuleCode: string | null;
  academicModuleCode: string | null;
  /** true si al menos uno se pudo resolver. */
  resolved: boolean;
}

function readConfigString(items: SystemConfigItem[] | undefined, key: string): string | null {
  const entry = items?.find((item) => item.key === key);
  return typeof entry?.value === 'string' && entry.value !== '' ? entry.value : null;
}

export function useInstitutionModules(): InstitutionModules {
  const { settings } = useCatalogs();
  const { hasFullAccess } = useAuth();

  const fromSettings = {
    hr: settings?.hr_module_code ?? null,
    academic: settings?.academic_module_code ?? null,
  };

  // Sólo se consulta si hace falta y el usuario tiene acceso a /system/config.
  const needsConfig = hasFullAccess && (fromSettings.hr === null || fromSettings.academic === null);
  const config = useQuery(needsConfig ? 'system:config' : null, (signal) => systemApi.getConfig(signal), {
    staleTime: 300_000,
  });

  return useMemo(() => {
    const hrModuleCode = fromSettings.hr ?? readConfigString(config.data, 'hr_module_code');
    const academicModuleCode =
      fromSettings.academic ?? readConfigString(config.data, 'academic_module_code');
    return {
      hrModuleCode,
      academicModuleCode,
      resolved: hrModuleCode !== null || academicModuleCode !== null,
    };
  }, [fromSettings.hr, fromSettings.academic, config.data]);
}

export interface PersonFileLabels {
  /** "Hoja de vida", "Expediente académico" o la forma neutra por tipo. */
  fileLabel: (typeCode: string | null | undefined, expedientes?: Expediente[]) => string;
}

export function usePersonFileLabels(): PersonFileLabels {
  const { personTypeLabel } = useCatalogs();
  const { hrModuleCode, academicModuleCode } = useInstitutionModules();

  const fileLabel = useMemo(
    () =>
      (typeCode: string | null | undefined, expedientes: Expediente[] = []): string => {
        const modules = new Set(expedientes.map((exp) => exp.module_code));
        if (hrModuleCode && modules.has(hrModuleCode)) return 'Hoja de vida';
        if (academicModuleCode && modules.has(academicModuleCode)) return 'Expediente académico';
        return `Expediente de ${personTypeLabel(typeCode).toLocaleLowerCase('es')}`;
      },
    [hrModuleCode, academicModuleCode, personTypeLabel],
  );

  return { fileLabel };
}
