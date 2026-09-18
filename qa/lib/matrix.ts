import fs from 'node:fs';
import { QA } from './config.js';

export type Outcome = 'PERMITIDO' | 'DENEGADO' | 'NO_APLICA' | 'ERROR';

export type MatrixEntry = {
  feature: string;
  domain: string;
  role: string;
  permission: 'read' | 'write' | 'n/a';
  module?: string | null;
  expected: Outcome;
  actual: Outcome;
  status: number;
  code?: string | null;
  match: boolean;
  note?: string;
};

export function outcomeFromStatus(status: number): Outcome {
  if (status === 403) return 'DENEGADO';
  if (status === 401) return 'DENEGADO';
  if (status >= 200 && status < 400) return 'PERMITIDO';
  // 404 en recursos protegidos también es una negativa legítima (no revela existencia).
  if (status === 404) return 'DENEGADO';
  if (status === 503) return 'PERMITIDO'; // autorizado pero sin infraestructura (S3/IA)
  return 'ERROR';
}

export function record(entry: Omit<MatrixEntry, 'match'>): MatrixEntry {
  const full: MatrixEntry = { ...entry, match: entry.expected === entry.actual };
  fs.appendFileSync(QA.matrixPath, `${JSON.stringify(full)}\n`, 'utf8');
  return full;
}

export type Defect = {
  id?: string;
  severity: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  title: string;
  steps: string;
  expected: string;
  actual: string;
  area: string;
};

export function defect(d: Defect): void {
  fs.appendFileSync(QA.defectsPath, `${JSON.stringify(d)}\n`, 'utf8');
}
