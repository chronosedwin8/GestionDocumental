import fs from 'node:fs';
import { QA } from './config.js';
import { ApiClient } from './client.js';
import { closeDb, sql, sqlOne } from './db.js';
import { cleanupAll, seedDocument } from './fixtures.js';
import { makeCsv, makeDocx, makePdf, makeTxt, makeXlsx } from './files.js';
import { buildCoverageMatrix } from './build-matrix.js';

export type QaState = {
  roles: { code: string; has_full_access: boolean; can_manage_users: boolean }[];
  modules: string[];
  matrix: { role_code: string; module_code: string; can_read: boolean; can_write: boolean }[];
  users: Record<string, { id: string; email: string; password: string; temporary: string }>;
  secondDocente: { id: string; email: string; password: string };
  docTypes: Record<string, string>;
  docs: Record<string, string>;
  people: Record<string, string>;
  periodId: string;
};

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${QA.baseUrl}/system/health`);
      if (res.ok) return;
    } catch {
      /* reintenta */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor QA no responde en ${QA.baseUrl}. Arrancalo con "npm --prefix qa run server:start".`);
}

export default async function setup(): Promise<() => Promise<void>> {
  for (const p of [QA.matrixPath, QA.defectsPath]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  await waitForServer();
  await cleanupAll();

  const roles = await sql<{ code: string; has_full_access: boolean; can_manage_users: boolean }>(
    'SELECT code, has_full_access, can_manage_users FROM roles ORDER BY sort_order, code',
  );
  const modules = (
    await sql<{ code: string }>('SELECT code FROM modules WHERE is_active = true ORDER BY sort_order')
  ).map((m) => m.code);
  const matrix = await sql<{ role_code: string; module_code: string; can_read: boolean; can_write: boolean }>(
    'SELECT role_code, module_code, can_read, can_write FROM role_module_access',
  );

  const admin = new ApiClient('ADMIN_SEED');
  const login = await admin.login(QA.adminEmail, QA.adminPassword);
  if (!login.ok) throw new Error(`No fue posible iniciar sesion como administrador semilla: ${login.raw}`);

  // Un usuario por cada rol de la tabla `roles`, creado por la API real.
  const users: QaState['users'] = {};
  for (const role of roles) {
    const email = `qa.role.${role.code.toLowerCase()}@eduarchive.test`;
    const temporary = `QaTmp${role.code.slice(0, 3)}2026!`;
    const created = await admin.post('/users', {
      body: {
        email,
        full_name: `QA Usuario ${role.code}`,
        role_code: role.code,
        temporary_password: temporary,
      },
    });
    if (created.status !== 201) throw new Error(`No se pudo crear el usuario de ${role.code}: ${created.raw}`);
    users[role.code] = { id: created.body.id, email, password: QA.password, temporary };
  }

  const second = await admin.post('/users', {
    body: {
      email: 'qa.role.docente2@eduarchive.test',
      full_name: 'QA Usuario DOCENTE 2',
      role_code: 'DOCENTE',
      temporary_password: 'QaTmpDoc2026!',
    },
  });
  if (second.status !== 201) throw new Error(`No se pudo crear el segundo docente: ${second.raw}`);

  // Cada usuario cambia su contrasena temporal. AUDITOR la conserva para
  // que auth.spec pueda comprobar el flujo `must_change_password`.
  for (const role of roles) {
    if (role.code === 'AUDITOR') continue;
    const client = new ApiClient(role.code);
    const res = await client.login(users[role.code].email, users[role.code].temporary);
    if (!res.ok) throw new Error(`Login inicial fallido para ${role.code}: ${res.raw}`);
    const change = await client.post('/auth/change-password', {
      body: { currentPassword: users[role.code].temporary, newPassword: QA.password },
    });
    if (change.status !== 204) throw new Error(`Cambio de contrasena fallido para ${role.code}: ${change.raw}`);
  }
  users.AUDITOR.password = users.AUDITOR.temporary;

  const secondClient = new ApiClient('DOCENTE2');
  await secondClient.login('qa.role.docente2@eduarchive.test', 'QaTmpDoc2026!');
  await secondClient.post('/auth/change-password', {
    body: { currentPassword: 'QaTmpDoc2026!', newPassword: QA.password },
  });

  // Tipo documental valido (tomado de la TRD) por modulo.
  const docTypes: Record<string, string> = {};
  for (const module of modules) {
    const rule = await sqlOne<{ document_type: string }>(
      'SELECT document_type FROM retention_rules WHERE module_code = $1 ORDER BY document_type LIMIT 1',
      [module],
    );
    if (rule) docTypes[module] = rule.document_type;
  }

  const adminRow = await sqlOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
    QA.adminEmail,
  ]);
  const adminId = adminRow!.id;
  const files = [makePdf(), makeDocx(), makeXlsx(), makeTxt(), makeCsv()];
  const docs: Record<string, string> = {};

  let i = 0;
  for (const module of modules) {
    const file = files[i % files.length];
    i += 1;
    docs[`mod_${module}`] = await seedDocument({
      title: `${QA.prefix}Doc ${module}`,
      module,
      type: docTypes[module],
      file,
      authorId: adminId,
    });
  }

  const special: { key: string; module: string; status?: string; folio?: boolean; text?: string }[] = [
    { key: 'aprobado', module: 'ACADEMIC', status: 'APROBADO' },
    { key: 'bloqueado', module: 'ACADEMIC', status: 'BLOQUEO_ADMIN' },
    { key: 'permanente', module: 'ACADEMIC', status: 'CONSERVACION_PERMANENTE' },
    { key: 'central', module: 'ACADEMIC', status: 'ARCHIVO_CENTRAL' },
    { key: 'historico', module: 'ACADEMIC', status: 'ARCHIVO_HISTORICO' },
    { key: 'gestion', module: 'ACADEMIC' },
    { key: 'transfer_seq', module: 'ACADEMIC' },
    { key: 'transfer_skip', module: 'ACADEMIC' },
    { key: 'papelera', module: 'ACADEMIC' },
    { key: 'purga', module: 'ACADEMIC' },
    { key: 'prestamo', module: 'ACADEMIC' },
    { key: 'lock_target', module: 'ACADEMIC' },
    { key: 'edit_target', module: 'ACADEMIC' },
    { key: 'trd_target', module: 'ACADEMIC' },
    { key: 'folio_race', module: 'ACADEMIC', folio: false },
    {
      key: 'busqueda',
      module: 'ACADEMIC',
      text: 'Informe sobre robotica educativa y matematicas aplicadas en el Colegio Aleman de Barranquilla.',
    },
    { key: 'relacion_a', module: 'ACADEMIC' },
    { key: 'relacion_b', module: 'ACADEMIC' },
    { key: 'fin_privado', module: 'FINANCIAL' },
    { key: 'rrhh_privado', module: 'HUMAN_RESOURCES' },
    { key: 'board_privado', module: 'BOARD' },
    { key: 'escalada_board', module: 'BOARD' },
  ];

  let j = 0;
  for (const item of special) {
    const file = files[j % files.length];
    j += 1;
    docs[item.key] = await seedDocument({
      title: `${QA.prefix}Doc ${item.key}`,
      module: item.module,
      type: docTypes[item.module],
      file,
      authorId: adminId,
      status: item.status,
      folio: item.folio,
      extractedText: item.text ?? null,
    });
  }

  const period = await sqlOne<{ id: string }>('SELECT id FROM academic_periods ORDER BY is_current DESC LIMIT 1');

  const people: Record<string, string> = {};
  const persona = await admin.post('/people', {
    body: {
      type_code: 'EMPLOYEE',
      document_number: `${QA.prefix}1001`,
      first_name: `${QA.prefix}Ana`,
      last_name: 'Perez',
      email: 'qa.persona@eduarchive.test',
    },
  });
  if (persona.status === 201) people.empleado = persona.body.id;

  const estudiante = await admin.post('/people', {
    body: {
      type_code: 'STUDENT',
      document_number: `${QA.prefix}1002`,
      first_name: `${QA.prefix}Luis`,
      last_name: 'Gomez',
    },
  });
  if (estudiante.status === 201) people.estudiante = estudiante.body.id;

  const state: QaState = {
    roles,
    modules,
    matrix,
    users,
    secondDocente: { id: second.body.id, email: 'qa.role.docente2@eduarchive.test', password: QA.password },
    docTypes,
    docs,
    people,
    periodId: period!.id,
  };
  fs.writeFileSync(QA.statePath, JSON.stringify(state, null, 2), 'utf8');

  return async () => {
    const resumen = buildCoverageMatrix(roles.map((r) => r.code));
    console.log(
      `
[QA] Matriz de cobertura: ${resumen.total} comprobaciones caracteristica x rol, ` +
        `${resumen.desviaciones} desviaciones. -> qa/coverage-matrix.md`,
    );
    await cleanupAll();
    await closeDb();
  };
}
