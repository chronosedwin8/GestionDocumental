import fs from 'node:fs';
import { QA } from './config.js';
import type { MatrixEntry } from './matrix.js';

type Celda = {
  expected: string;
  actual: string;
  match: boolean;
  status: number;
  code: string | null;
  note?: string;
};

const SIMBOLO: Record<string, string> = {
  PERMITIDO: 'OK',
  DENEGADO: '403',
  NO_APLICA: 'n/a',
  ERROR: 'ERR',
};

function celdaTexto(celda: Celda | undefined): string {
  if (!celda) return '—';
  const marca = celda.match ? '' : ' ⚠';
  return `${SIMBOLO[celda.actual] ?? celda.actual} (${celda.status})${marca}`;
}

/**
 * Construye `coverage-matrix.md` y `coverage-matrix.json` cruzando
 * caracteristica x rol con el resultado obtenido y el esperado segun la
 * matriz `role_module_access` leida de la base.
 */
export function buildCoverageMatrix(roles: string[]): { total: number; desviaciones: number } {
  if (!fs.existsSync(QA.matrixPath)) {
    fs.writeFileSync(QA.outMatrixPath, '# Matriz de cobertura\n\nNo se registraron resultados.\n', 'utf8');
    return { total: 0, desviaciones: 0 };
  }

  const entradas: MatrixEntry[] = fs
    .readFileSync(QA.matrixPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linea) => JSON.parse(linea) as MatrixEntry);

  const porDominio = new Map<string, Map<string, Map<string, Celda>>>();
  for (const entrada of entradas) {
    if (!porDominio.has(entrada.domain)) porDominio.set(entrada.domain, new Map());
    const dominio = porDominio.get(entrada.domain)!;
    if (!dominio.has(entrada.feature)) dominio.set(entrada.feature, new Map());
    dominio.get(entrada.feature)!.set(entrada.role, {
      expected: entrada.expected,
      actual: entrada.actual,
      match: entrada.match,
      status: entrada.status,
      code: entrada.code ?? null,
      note: entrada.note,
    });
  }

  const desviaciones = entradas.filter((e) => !e.match);
  const caracteristicas = new Set(entradas.map((e) => `${e.domain}::${e.feature}`)).size;

  const lineas: string[] = [];
  lineas.push('# Matriz de cobertura — caracteristica x rol');
  lineas.push('');
  lineas.push(`_Generada automaticamente por la bateria de QA el ${new Date().toISOString()}._`);
  lineas.push('');
  lineas.push('Cada celda muestra el **resultado obtenido** contra la API real y, entre parentesis,');
  lineas.push('el codigo HTTP. `OK` = permitido, `403` = denegado, `n/a` = no aplica (servicio externo');
  lineas.push('no configurado en el entorno de QA). El simbolo ⚠ marca las celdas donde lo obtenido');
  lineas.push('**no coincide** con lo esperado segun `role_module_access` leida de la base.');
  lineas.push('');
  lineas.push('## Resumen');
  lineas.push('');
  lineas.push('| Metrica | Valor |');
  lineas.push('| --- | ---: |');
  lineas.push(`| Roles cubiertos | ${roles.length} |`);
  lineas.push(`| Caracteristicas cubiertas | ${caracteristicas} |`);
  lineas.push(`| Comprobaciones caracteristica x rol | ${entradas.length} |`);
  lineas.push(`| Coincidencias con lo esperado | ${entradas.length - desviaciones.length} |`);
  lineas.push(`| **Desviaciones (⚠)** | **${desviaciones.length}** |`);
  lineas.push('');

  if (desviaciones.length > 0) {
    lineas.push('## Desviaciones detectadas');
    lineas.push('');
    lineas.push('| Dominio | Caracteristica | Rol | Modulo | Esperado | Obtenido | HTTP |');
    lineas.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const d of desviaciones) {
      lineas.push(
        `| ${d.domain} | \`${d.feature}\` | ${d.role} | ${d.module ?? '—'} | ${d.expected} | ${d.actual} | ${d.status} ${d.code ?? ''} |`,
      );
    }
    lineas.push('');
  }

  const dominios = [...porDominio.keys()].sort();
  for (const dominio of dominios) {
    lineas.push(`## ${dominio}`);
    lineas.push('');
    lineas.push(`| Caracteristica | ${roles.join(' | ')} |`);
    lineas.push(`| --- | ${roles.map(() => '---').join(' | ')} |`);
    const features = [...porDominio.get(dominio)!.keys()].sort();
    for (const feature of features) {
      const fila = porDominio.get(dominio)!.get(feature)!;
      lineas.push(`| \`${feature}\` | ${roles.map((r) => celdaTexto(fila.get(r))).join(' | ')} |`);
    }
    lineas.push('');
  }

  fs.writeFileSync(QA.outMatrixPath, lineas.join('\n'), 'utf8');
  fs.writeFileSync(
    QA.outMatrixJsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        roles,
        checks: entradas.length,
        features: caracteristicas,
        deviations: desviaciones,
        entries: entradas,
      },
      null,
      2,
    ),
    'utf8',
  );

  return { total: entradas.length, desviaciones: desviaciones.length };
}
