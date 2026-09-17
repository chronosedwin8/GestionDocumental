/**
 * ============================================================
 * Migración de datos reales del proyecto Supabase legado
 * hacia la base `eduarchive` del servidor propio.
 *
 *   npm --prefix server run migrate:legacy -- [opciones]
 *
 * Opciones:
 *   --source=<ruta>   Carpeta con los JSON exportados
 *                     (por defecto: <raíz>/docs/legacy/data)
 *   --dry-run         Cuenta e informa; hace ROLLBACK al final (no escribe).
 *   --rollback        Deshace exactamente lo importado usando
 *                     `legacy_migration_map`. Admite --dry-run.
 *
 * Propiedades:
 *   · TODO ocurre dentro de UNA sola transacción.
 *   · Idempotente: ON CONFLICT DO NOTHING/DO UPDATE en cada tabla.
 *   · Reversible: cada fila creada, reutilizada o modificada queda
 *     registrada en `legacy_migration_map`.
 *   · Nada hardcodeado: módulos, roles, estados, disposiciones,
 *     tipos de notificación y de correspondencia se resuelven
 *     consultando los catálogos de la base.
 * ============================================================
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { SERVER_ROOT } from '../src/config/env.js';
import { pool, closePool } from '../src/db/pool.js';
import { decryptJson, encryptJson, generateStrongPassword } from '../src/lib/crypto.js';

const BCRYPT_COST = 12;
const CREDENTIALS_FILE = path.join(SERVER_ROOT, '.migration-credentials.txt');
const DEFAULT_SOURCE = path.resolve(SERVER_ROOT, '..', 'docs', 'legacy', 'data');

/**
 * Equivalencias de estado exigidas por el plan de migración.
 * El destino se valida SIEMPRE contra `document_statuses`.
 */
const STATUS_ALIASES: Record<string, string> = {
  LOCKED_COMPLIANCE: 'CONSERVACION_PERMANENTE',
  FIRMADO_DIGITAL: 'APROBADO',
};

type Action = 'INSERTED' | 'REUSED' | 'UPDATED';

// ------------------------------------------------------------
// Argumentos
// ------------------------------------------------------------
type Options = { source: string; dryRun: boolean; rollback: boolean };

function parseArgs(argv: string[]): Options {
  let source = DEFAULT_SOURCE;
  let dryRun = false;
  let rollback = false;

  for (const arg of argv) {
    if (arg.startsWith('--source=')) source = path.resolve(arg.slice('--source='.length));
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--rollback') rollback = true;
    else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`);
  }
  return { source, dryRun, rollback };
}

// ------------------------------------------------------------
// Informe
// ------------------------------------------------------------
type TableStat = { legacy: number; inserted: number; reused: number; skipped: number };

class Report {
  private readonly tables = new Map<string, TableStat>();
  private readonly notes: string[] = [];

  count(table: string, legacy: number): TableStat {
    const current = this.tables.get(table) ?? { legacy: 0, inserted: 0, reused: 0, skipped: 0 };
    current.legacy = legacy;
    this.tables.set(table, current);
    return current;
  }

  note(message: string): void {
    this.notes.push(message);
  }

  get allNotes(): string[] {
    return this.notes;
  }

  print(title: string): void {
    const rows = [...this.tables.entries()];
    const width = Math.max(28, ...rows.map(([name]) => name.length));
    console.log(`\n${title}`);
    console.log(
      `${'tabla'.padEnd(width)} | ${'legado'.padStart(7)} | ${'nuevas'.padStart(7)} | ${'existían'.padStart(8)} | ${'omitidas'.padStart(8)}`,
    );
    console.log(`${'-'.repeat(width)}-+---------+---------+----------+---------`);
    let totals = { legacy: 0, inserted: 0, reused: 0, skipped: 0 };
    for (const [name, s] of rows) {
      console.log(
        `${name.padEnd(width)} | ${String(s.legacy).padStart(7)} | ${String(s.inserted).padStart(7)} | ${String(s.reused).padStart(8)} | ${String(s.skipped).padStart(8)}`,
      );
      totals = {
        legacy: totals.legacy + s.legacy,
        inserted: totals.inserted + s.inserted,
        reused: totals.reused + s.reused,
        skipped: totals.skipped + s.skipped,
      };
    }
    console.log(`${'-'.repeat(width)}-+---------+---------+----------+---------`);
    console.log(
      `${'TOTAL'.padEnd(width)} | ${String(totals.legacy).padStart(7)} | ${String(totals.inserted).padStart(7)} | ${String(totals.reused).padStart(8)} | ${String(totals.skipped).padStart(8)}`,
    );

    if (this.notes.length > 0) {
      console.log('\nDecisiones y avisos:');
      for (const n of this.notes) console.log(`  · ${n}`);
    }
  }
}

// ------------------------------------------------------------
// Lectura y validación de los JSON
// ------------------------------------------------------------
const uuid = z.string().uuid();
const ts = z.string();

const schemas = {
  profiles: z.object({
    id: uuid,
    email: z.string().email(),
    full_name: z.string(),
    role: z.string(),
    department: z.string().nullable().optional(),
    avatar_url: z.string().nullable().optional(),
    is_active: z.boolean().nullable().optional(),
    allowed_modules: z.array(z.string()).nullable().optional(),
    last_seen_at: ts.nullable().optional(),
    created_at: ts.nullable().optional(),
    updated_at: ts.nullable().optional(),
  }),
  documents: z
    .object({
      id: uuid,
      title: z.string(),
      type: z.string(),
      module: z.string(),
      s3_key: z.string().min(1),
      s3_bucket: z.string().min(1),
      status: z.string().nullable().optional(),
    })
    .passthrough(),
  document_tags: z.object({ id: uuid, document_id: uuid, tag: z.string() }).passthrough(),
  document_metadata: z.object({ id: uuid, document_id: uuid, key: z.string() }).passthrough(),
  document_notes: z.object({ id: uuid, document_id: uuid, text: z.string() }).passthrough(),
  document_versions: z
    .object({ id: uuid, document_id: uuid, version_number: z.string(), s3_key: z.string() })
    .passthrough(),
  document_relations: z
    .object({ id: uuid, source_document_id: uuid, target_document_id: uuid })
    .passthrough(),
  document_permissions: z.object({ document_id: uuid, role: z.string() }).passthrough(),
  expedientes: z
    .object({ id: uuid, radicado: z.string(), titulo: z.string(), module: z.string() })
    .passthrough(),
  expediente_documents: z.object({ id: uuid, expediente_id: uuid, document_id: uuid }).passthrough(),
  document_loans: z
    .object({
      id: uuid,
      document_id: uuid,
      document_title: z.string(),
      module: z.string(),
      loaned_to: uuid,
      loaned_by: uuid,
      expected_return_date: z.string(),
      purpose: z.string(),
    })
    .passthrough(),
  notifications: z
    .object({ id: uuid, user_id: uuid, type: z.string(), title: z.string(), message: z.string() })
    .passthrough(),
  custody_chain: z
    .object({ id: uuid, document_title: z.string(), document_module: z.string(), event_type: z.string() })
    .passthrough(),
  audit_logs: z.object({ id: uuid, action: z.string() }).passthrough(),
  deletion_logs: z
    .object({
      id: uuid,
      document_id: uuid,
      document_title: z.string(),
      document_module: z.string(),
      document_s3_key: z.string(),
      deleted_by_name: z.string(),
      reason: z.string(),
    })
    .passthrough(),
  deletion_requests: z
    .object({
      id: uuid,
      document_id: uuid,
      document_title: z.string(),
      document_module: z.string(),
      document_s3_key: z.string(),
      requested_by: uuid,
      requested_by_name: z.string(),
      reason: z.string(),
    })
    .passthrough(),
  retention_rules: z
    .object({ id: uuid, module: z.string(), document_type: z.string(), retention_years: z.number() })
    .passthrough(),
  document_categories: z.object({ id: uuid, name: z.string() }).passthrough(),
  role_module_access: z.object({ role: z.string(), module: z.string() }).passthrough(),
  role_permissions: z.object({ role: z.string() }).passthrough(),
  system_config: z.object({ key: z.string(), value: z.unknown() }).passthrough(),
} as const;

type LegacyName = keyof typeof schemas;

type LegacyData = { [K in LegacyName]: z.infer<(typeof schemas)[K]>[] };

async function loadLegacy(source: string): Promise<LegacyData> {
  try {
    await fs.access(source);
  } catch {
    throw new Error(
      `No existe la carpeta de origen "${source}". Indícala con --source=<ruta> (contiene los .json exportados de Supabase).`,
    );
  }

  const data = {} as LegacyData;
  for (const name of Object.keys(schemas) as LegacyName[]) {
    const file = path.join(source, `${name}.json`);
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      throw new Error(
        `Falta el archivo obligatorio "${name}.json" en ${source}. La migración se aborta sin escribir nada.`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`El archivo "${name}.json" no es JSON válido: ${(error as Error).message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`El archivo "${name}.json" debe contener un arreglo JSON.`);
    }

    const result = z.array(schemas[name]).safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `"${name}.json" no cumple el esquema mínimo: fila ${String(issue?.path[0] ?? '?')} → ${issue?.path.slice(1).map(String).join('.')}: ${issue?.message}`,
      );
    }
    (data as Record<string, unknown>)[name] = result.data;
  }
  return data;
}

// ------------------------------------------------------------
// Catálogos vivos (nada hardcodeado)
// ------------------------------------------------------------
type Catalogs = {
  modules: { code: string; name: string; s3_folder: string }[];
  moduleCodes: Set<string>;
  moduleByText: Map<string, string>;
  roles: Set<string>;
  statuses: Set<string>;
  dispositions: Set<string>;
  notificationTypes: Set<string>;
  correspondenceTypes: Set<string>;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function loadCatalogs(client: PoolClient): Promise<Catalogs> {
  const modules = (
    await client.query<{ code: string; name: string; s3_folder: string }>(
      'SELECT code, name, s3_folder FROM modules ORDER BY sort_order',
    )
  ).rows;

  const moduleByText = new Map<string, string>();
  for (const m of modules) {
    moduleByText.set(normalize(m.code), m.code);
    moduleByText.set(normalize(m.name), m.code);
    moduleByText.set(normalize(m.s3_folder), m.code);
  }

  const setOf = async (sql: string): Promise<Set<string>> =>
    new Set((await client.query<{ code: string }>(sql)).rows.map((r) => r.code));

  return {
    modules,
    moduleCodes: new Set(modules.map((m) => m.code)),
    moduleByText,
    roles: await setOf('SELECT code FROM roles'),
    statuses: await setOf('SELECT code FROM document_statuses'),
    dispositions: await setOf('SELECT code FROM dispositions'),
    notificationTypes: await setOf('SELECT code FROM notification_types'),
    correspondenceTypes: await setOf('SELECT code FROM correspondence_types'),
  };
}

// ------------------------------------------------------------
// Rastreo
// ------------------------------------------------------------
class Tracker {
  constructor(private readonly client: PoolClient) {}

  /** Registra el destino de un registro legado (la primera decisión manda). */
  async record(table: string, legacyId: string, newId: string, action: Action): Promise<void> {
    await this.client.query(
      `INSERT INTO legacy_migration_map (legacy_table, legacy_id, new_id, action)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (legacy_table, legacy_id) DO NOTHING`,
      [table, legacyId, newId, action],
    );
  }
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function baseName(key: string): string {
  const segment = key.split('/').filter(Boolean).pop() ?? 'archivo';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function asJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function trailingSeq(value: string): number | null {
  const match = /(\d+)\s*$/.exec(value);
  return match ? Number(match[1]) : null;
}

function embeddedYear(value: string): number | null {
  const match = /-((?:19|20)\d{2})-/.exec(value);
  return match ? Number(match[1]) : null;
}

function yearOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

// ============================================================
// IMPORTACIÓN
// ============================================================
type Credential = { email: string; password: string };

async function importAll(
  client: PoolClient,
  data: LegacyData,
  report: Report,
): Promise<{ credentials: Credential[] }> {
  const cat = await loadCatalogs(client);
  const track = new Tracker(client);
  const credentials: Credential[] = [];

  // El trigger de `updated_at` de documentos pisaría las fechas originales
  // cuando los triggers de etiquetas/metadatos refrescan el search_vector.
  await client.query('ALTER TABLE documents DISABLE TRIGGER trg_documents_updated');

  // ----------------------------------------------------------
  // 1. Roles faltantes (desde cualquier origen legado que traiga rol)
  // ----------------------------------------------------------
  const legacyRoles = new Set<string>();
  for (const r of data.role_permissions) legacyRoles.add(String(r.role));
  for (const r of data.role_module_access) legacyRoles.add(String(r.role));
  for (const r of data.document_permissions) legacyRoles.add(String((r as { role: string }).role));
  for (const p of data.profiles) legacyRoles.add(String(p.role));

  const rolesStat = report.count('roles', legacyRoles.size);
  for (const code of [...legacyRoles].sort()) {
    if (cat.roles.has(code)) {
      rolesStat.reused += 1;
      continue;
    }
    const perms = data.role_permissions.find((r) => r.role === code) as
      | { can_read?: boolean; can_write?: boolean; can_delete?: boolean; can_manage_users?: boolean }
      | undefined;
    const fullAccess = Boolean(perms?.can_read && perms?.can_write && perms?.can_delete);
    await client.query(
      `INSERT INTO roles (code, name, description, has_full_access, can_manage_users, is_system, sort_order)
       VALUES ($1, $1, $2, $3, $4, false, 99)
       ON CONFLICT (code) DO NOTHING`,
      [code, 'Rol importado del sistema legado', fullAccess, Boolean(perms?.can_manage_users)],
    );
    await track.record('roles', code, code, 'INSERTED');
    cat.roles.add(code);
    rolesStat.inserted += 1;
    report.note(`Rol legado sin equivalencia creado como rol NO de sistema: "${code}".`);
  }

  // role_permissions: el catálogo nuevo vive en `roles`; las semillas son canónicas.
  const rpStat = report.count('role_permissions', data.role_permissions.length);
  for (const row of data.role_permissions) {
    if (cat.roles.has(String(row.role))) rpStat.reused += 1;
    else rpStat.skipped += 1;
  }
  report.note(
    'role_permissions legado se resuelve sobre la tabla `roles` (has_full_access / can_manage_users); ' +
      'los valores canónicos de las semillas NO se sobrescriben.',
  );

  // ----------------------------------------------------------
  // 2. profiles → users
  // ----------------------------------------------------------
  const userMap = new Map<string, string>();
  const usersStat = report.count('profiles → users', data.profiles.length);

  for (const profile of data.profiles) {
    // Departamento: solo si resuelve a un modules.code (código, nombre o carpeta S3)
    let departmentCode: string | null = null;
    if (profile.department) {
      departmentCode = cat.moduleByText.get(normalize(profile.department)) ?? null;
      if (!departmentCode) {
        report.note(
          `Departamento sin equivalencia en \`modules\` para ${profile.email}: "${profile.department}" → department_code = NULL.`,
        );
      } else if (departmentCode !== profile.department) {
        report.note(
          `Departamento traducido para ${profile.email}: "${profile.department}" → ${departmentCode}.`,
        );
      }
    }

    const roleCode = cat.roles.has(String(profile.role)) ? String(profile.role) : 'SIN_ASIGNAR';
    if (roleCode !== profile.role) {
      report.note(`Rol legado "${profile.role}" de ${profile.email} no existe: se asignó SIN_ASIGNAR.`);
    }

    // allowed_modules tal cual; `{}` legado significaba "sin excepciones",
    // que en el esquema nuevo se expresa con NULL (un arreglo vacío bloquearía todo).
    let allowed: string[] | null = profile.allowed_modules ?? null;
    if (allowed !== null && allowed.length === 0) {
      allowed = null;
      report.note(
        `allowed_modules = '{}' de ${profile.email} se importó como NULL (en el esquema nuevo el arreglo vacío significa "sin acceso a ningún módulo"; ver CONTRACT_NOTES §2.1).`,
      );
    }

    const existing = (
      await client.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
        profile.email,
      ])
    ).rows[0];

    if (existing) {
      let mappedId = existing.id;
      if (existing.id !== profile.id) {
        // Se intenta conservar el UUID legado; si rompe integridad se mapea.
        await client.query('SAVEPOINT sp_user_id');
        try {
          await client.query('UPDATE users SET id = $1 WHERE id = $2', [profile.id, existing.id]);
          await client.query('RELEASE SAVEPOINT sp_user_id');
          mappedId = profile.id;
          await track.record('users.id_reassigned', profile.id, existing.id, 'UPDATED');
          report.note(
            `Usuario ya sembrado ${profile.email}: se reasignó su id al UUID legado ${profile.id} (contraseña intacta).`,
          );
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT sp_user_id');
          await client.query('RELEASE SAVEPOINT sp_user_id');
          mappedId = existing.id;
          report.note(
            `Usuario ya sembrado ${profile.email}: reasignar el id rompía integridad referencial; ` +
              `el UUID legado ${profile.id} se mapea a ${existing.id} y todas las referencias se traducen.`,
          );
        }
      } else {
        report.note(
          `Usuario ${profile.email} ya existe con el UUID legado: se reutiliza sin tocar su contraseña.`,
        );
      }
      userMap.set(profile.id, mappedId);
      await track.record('users', profile.id, mappedId, 'REUSED');
      usersStat.reused += 1;
      continue;
    }

    const temporary = generateStrongPassword(16);
    const hash = await bcrypt.hash(temporary, BCRYPT_COST);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, password_hash, full_name, role_code, department_code,
                          allowed_modules, is_active, must_change_password, avatar_url,
                          last_seen_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,
               COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        profile.id,
        profile.email,
        hash,
        profile.full_name,
        roleCode,
        departmentCode,
        allowed,
        profile.is_active ?? true,
        profile.avatar_url ?? null,
        profile.last_seen_at ?? null,
        profile.created_at ?? null,
        profile.updated_at ?? null,
      ],
    );

    userMap.set(profile.id, profile.id);
    if (inserted.rowCount && inserted.rowCount > 0) {
      credentials.push({ email: profile.email, password: temporary });
      await track.record('users', profile.id, profile.id, 'INSERTED');
      usersStat.inserted += 1;
    } else {
      await track.record('users', profile.id, profile.id, 'REUSED');
      usersStat.reused += 1;
    }
  }

  // Referencias de usuario ya mapeadas desde ejecuciones previas
  for (const row of (
    await client.query<{ legacy_id: string; new_id: string }>(
      "SELECT legacy_id, new_id FROM legacy_migration_map WHERE legacy_table = 'users'",
    )
  ).rows) {
    if (!userMap.has(row.legacy_id)) userMap.set(row.legacy_id, row.new_id);
  }

  const userRef = (id: string | null | undefined): string | null => (id ? (userMap.get(id) ?? null) : null);

  const adminId =
    userRef(data.profiles.find((p) => p.role === 'ADMIN')?.id ?? null) ??
    (
      await client.query<{ id: string }>(
        "SELECT id FROM users WHERE role_code = 'ADMIN' ORDER BY created_at LIMIT 1",
      )
    ).rows[0]?.id ??
    null;

  // ----------------------------------------------------------
  // 3. document_categories — solo las que no existan
  // ----------------------------------------------------------
  const catStat = report.count('document_categories', data.document_categories.length);
  const categoryMap = new Map<string, string>();
  const pendingCats = [...data.document_categories] as {
    id: string;
    name: string;
    description?: string | null;
    color?: string | null;
    module?: string | null;
    parent_id?: string | null;
    is_active?: boolean | null;
    sort_order?: number | null;
    created_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[];

  // Orden topológico: padres antes que hijos
  let guard = 0;
  while (pendingCats.length > 0 && guard < 50) {
    guard += 1;
    const ready = pendingCats.filter((c) => !c.parent_id || categoryMap.has(c.parent_id));
    if (ready.length === 0) break;
    for (const legacyCat of ready) {
      pendingCats.splice(pendingCats.indexOf(legacyCat), 1);
      const moduleCode = legacyCat.module
        ? (cat.moduleByText.get(normalize(legacyCat.module)) ?? null)
        : null;
      const parentId = legacyCat.parent_id ? (categoryMap.get(legacyCat.parent_id) ?? null) : null;

      const insert = await client.query<{ id: string }>(
        `INSERT INTO document_categories (name, description, color, module_code, parent_id,
                                          is_active, sort_order, created_by, created_at, updated_at)
         VALUES ($1,$2,COALESCE($3,'#6366f1'),$4,$5,COALESCE($6,true),COALESCE($7,0),$8,
                 COALESCE($9::timestamptz, now()), COALESCE($10::timestamptz, now()))
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          legacyCat.name,
          legacyCat.description ?? null,
          legacyCat.color ?? null,
          moduleCode,
          parentId,
          legacyCat.is_active ?? null,
          legacyCat.sort_order ?? null,
          userRef(legacyCat.created_by),
          legacyCat.created_at ?? null,
          legacyCat.updated_at ?? null,
        ],
      );

      if (insert.rows[0]) {
        categoryMap.set(legacyCat.id, insert.rows[0].id);
        await track.record('document_categories', legacyCat.id, insert.rows[0].id, 'INSERTED');
        catStat.inserted += 1;
      } else {
        const existing = (
          await client.query<{ id: string }>(
            `SELECT id FROM document_categories
              WHERE name = $1
                AND module_code IS NOT DISTINCT FROM $2
                AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                    = COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
            [legacyCat.name, moduleCode, parentId],
          )
        ).rows[0];
        if (existing) {
          categoryMap.set(legacyCat.id, existing.id);
          await track.record('document_categories', legacyCat.id, existing.id, 'REUSED');
          catStat.reused += 1;
        } else {
          catStat.skipped += 1;
        }
      }
    }
  }
  catStat.skipped += pendingCats.length;
  if (pendingCats.length > 0) {
    report.note(`${pendingCats.length} categorías legadas quedaron sin importar (padre irresoluble).`);
  }

  // ----------------------------------------------------------
  // 4. retention_rules — solo las que no existan (módulo + tipo)
  // ----------------------------------------------------------
  const trdStat = report.count('retention_rules', data.retention_rules.length);
  for (const rule of data.retention_rules as {
    id: string;
    module: string;
    document_type: string;
    retention_years: number;
    disposition?: string | null;
    description?: string | null;
    created_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(rule.module));
    if (!moduleCode) {
      trdStat.skipped += 1;
      report.note(`Regla TRD omitida: módulo legado desconocido "${rule.module}" (${rule.document_type}).`);
      continue;
    }
    let disposition = rule.disposition ?? null;
    if (!disposition || !cat.dispositions.has(disposition)) {
      const fallback = [...cat.dispositions][0] ?? 'CONSERVAR';
      report.note(
        `Disposición legada "${rule.disposition ?? 'NULL'}" desconocida en ${moduleCode}/${rule.document_type}: se usó ${fallback}.`,
      );
      disposition = fallback;
    }

    const insert = await client.query<{ id: string }>(
      `INSERT INTO retention_rules (module_code, document_type, retention_years, disposition_code,
                                    description, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()), COALESCE($8::timestamptz, now()))
       ON CONFLICT (module_code, document_type) DO NOTHING
       RETURNING id`,
      [
        moduleCode,
        rule.document_type,
        rule.retention_years,
        disposition,
        rule.description ?? null,
        userRef(rule.created_by),
        rule.created_at ?? null,
        rule.updated_at ?? null,
      ],
    );

    if (insert.rows[0]) {
      await track.record('retention_rules', rule.id, insert.rows[0].id, 'INSERTED');
      trdStat.inserted += 1;
    } else {
      const existing = (
        await client.query<{ id: string }>(
          'SELECT id FROM retention_rules WHERE module_code = $1 AND document_type = $2',
          [moduleCode, rule.document_type],
        )
      ).rows[0];
      if (existing) await track.record('retention_rules', rule.id, existing.id, 'REUSED');
      trdStat.reused += 1;
    }
  }

  // ----------------------------------------------------------
  // 5. documents
  // ----------------------------------------------------------
  const docsStat = report.count('documents', data.documents.length);
  const documentIds = new Set<string>();
  const approvalsStat = report.count('document_approvals (is_signed)', 0);
  let signedCount = 0;

  for (const doc of data.documents as unknown as {
    id: string;
    title: string;
    type: string;
    module: string;
    folio_index?: string | null;
    s3_key: string;
    s3_bucket: string;
    status?: string | null;
    author_id?: string | null;
    summary?: string | null;
    category?: string | null;
    subcategory?: string | null;
    retention_end_date?: string | null;
    expiration_date?: string | null;
    is_signed?: boolean | null;
    signed_by?: string | null;
    signed_at?: string | null;
    file_size?: number | null;
    file_type?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
    deleted_by?: string | null;
    delete_reason?: string | null;
    permanent_delete_at?: string | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(doc.module));
    if (!moduleCode) {
      docsStat.skipped += 1;
      report.note(`Documento "${doc.title}" omitido: módulo legado desconocido "${doc.module}".`);
      continue;
    }

    const legacyStatus = doc.status ?? 'ARCHIVO_GESTION';
    const statusCode = STATUS_ALIASES[legacyStatus] ?? legacyStatus;
    if (!cat.statuses.has(statusCode)) {
      throw new Error(
        `Estado legado "${legacyStatus}" del documento ${doc.id} no tiene equivalente en document_statuses.`,
      );
    }
    if (STATUS_ALIASES[legacyStatus]) {
      report.note(`Estado ${legacyStatus} → ${statusCode} (documento "${doc.title}").`);
    }

    const isSigned = Boolean(doc.is_signed);
    const summary = doc.summary?.trim() ? doc.summary : null;

    const insert = await client.query<{ id: string; inserted: boolean }>(
      `INSERT INTO documents (id, title, type, module_code, folio_index, s3_key, s3_bucket,
                              file_name, file_type, file_size, sha256, page_count,
                              status_code, author_id, summary, extracted_text, ai_status,
                              category, subcategory, retention_end_date, expiration_date,
                              approved_by, approved_at,
                              deleted_at, deleted_by, delete_reason, permanent_delete_at,
                              created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,''),COALESCE($10,0),NULL,NULL,
               $11,$12,$13,NULL,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
               COALESCE($25::timestamptz, now()), COALESCE($26::timestamptz, now()))
       ON CONFLICT (id) DO UPDATE
          SET created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at
       RETURNING id, (xmax = 0) AS inserted`,
      [
        doc.id,
        doc.title,
        doc.type,
        moduleCode,
        doc.folio_index ?? null,
        doc.s3_key,
        doc.s3_bucket,
        baseName(doc.s3_key),
        doc.file_type ?? null,
        doc.file_size ?? null,
        statusCode,
        userRef(doc.author_id),
        summary,
        summary ? 'DONE' : 'PENDING',
        doc.category ?? null,
        doc.subcategory ?? null,
        doc.retention_end_date ?? null,
        doc.expiration_date ?? null,
        isSigned ? userRef(doc.signed_by) : null,
        isSigned ? (doc.signed_at ?? null) : null,
        doc.deleted_at ?? null,
        userRef(doc.deleted_by),
        doc.delete_reason ?? null,
        doc.permanent_delete_at ?? null,
        doc.created_at ?? null,
        doc.updated_at ?? null,
      ],
    );

    documentIds.add(doc.id);
    // `DO UPDATE` reimpone SIEMPRE las fechas archivísticas originales:
    // así la migración converge al mismo estado aunque otros procesos
    // (p. ej. el backfill de integridad) hayan tocado la fila.
    const wasInserted = (insert.rows[0] as unknown as { inserted?: boolean } | undefined)?.inserted === true;
    if (wasInserted) {
      await track.record('documents', doc.id, doc.id, 'INSERTED');
      docsStat.inserted += 1;
    } else {
      await track.record('documents', doc.id, doc.id, 'REUSED');
      docsStat.reused += 1;
    }

    if (isSigned) {
      signedCount += 1;
      const approval = await client.query<{ id: string }>(
        `INSERT INTO document_approvals (document_id, approved_by, approved_at, sha256, seal, reason)
         SELECT $1, $2, COALESCE($3::timestamptz, now()), NULL, $4, $5
          WHERE NOT EXISTS (SELECT 1 FROM document_approvals WHERE document_id = $1)
         RETURNING id`,
        [
          doc.id,
          userRef(doc.signed_by),
          doc.signed_at ?? null,
          `LEGACY:${legacyStatus}`,
          'Firma electrónica registrada en el sistema legado (is_signed = true).',
        ],
      );
      if (approval.rows[0]) {
        await track.record('document_approvals', doc.id, approval.rows[0].id, 'INSERTED');
        approvalsStat.inserted += 1;
      } else {
        approvalsStat.reused += 1;
      }
    }
  }
  approvalsStat.legacy = signedCount;

  const docRef = (id: string | null | undefined): boolean => Boolean(id && documentIds.has(id));

  // ----------------------------------------------------------
  // 6. Hijos del documento
  // ----------------------------------------------------------
  const tagStat = report.count('document_tags', data.document_tags.length);
  for (const tag of data.document_tags as {
    id: string;
    document_id: string;
    tag: string;
    created_at?: string | null;
  }[]) {
    if (!docRef(tag.document_id)) {
      tagStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_tags (id, document_id, tag, created_at)
       VALUES ($1,$2,$3, COALESCE($4::timestamptz, now()))
       ON CONFLICT (document_id, tag) DO NOTHING
       RETURNING id`,
      [tag.id, tag.document_id, tag.tag, tag.created_at ?? null],
    );
    if (res.rows[0]) {
      await track.record('document_tags', tag.id, res.rows[0].id, 'INSERTED');
      tagStat.inserted += 1;
    } else tagStat.reused += 1;
  }

  const metaStat = report.count('document_metadata', data.document_metadata.length);
  for (const meta of data.document_metadata as {
    id: string;
    document_id: string;
    key: string;
    value?: string | null;
    is_extracted?: boolean | null;
    confidence?: number | null;
    created_at?: string | null;
  }[]) {
    if (!docRef(meta.document_id)) {
      metaStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_metadata (id, document_id, key, value, is_extracted, confidence, created_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,false),$6, COALESCE($7::timestamptz, now()))
       ON CONFLICT (document_id, key) DO NOTHING
       RETURNING id`,
      [
        meta.id,
        meta.document_id,
        meta.key,
        meta.value ?? null,
        meta.is_extracted ?? null,
        meta.confidence ?? null,
        meta.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('document_metadata', meta.id, res.rows[0].id, 'INSERTED');
      metaStat.inserted += 1;
    } else metaStat.reused += 1;
  }

  const noteStat = report.count('document_notes', data.document_notes.length);
  for (const note of data.document_notes as {
    id: string;
    document_id: string;
    author_id?: string | null;
    text: string;
    created_at?: string | null;
  }[]) {
    if (!docRef(note.document_id)) {
      noteStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_notes (id, document_id, author_id, text, created_at)
       VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [note.id, note.document_id, userRef(note.author_id), note.text, note.created_at ?? null],
    );
    if (res.rows[0]) {
      await track.record('document_notes', note.id, res.rows[0].id, 'INSERTED');
      noteStat.inserted += 1;
    } else noteStat.reused += 1;
  }

  const verStat = report.count('document_versions', data.document_versions.length);
  for (const version of data.document_versions as {
    id: string;
    document_id: string;
    version_number: string;
    s3_key: string;
    changes?: string | null;
    author_id?: string | null;
    file_size?: number | null;
    created_at?: string | null;
  }[]) {
    if (!docRef(version.document_id)) {
      verStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_versions (id, document_id, version_number, s3_key, file_name,
                                      file_size, sha256, changes, author_id, created_at)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),NULL,$7,$8, COALESCE($9::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        version.id,
        version.document_id,
        version.version_number,
        version.s3_key,
        baseName(version.s3_key),
        version.file_size ?? null,
        version.changes ?? null,
        userRef(version.author_id),
        version.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('document_versions', version.id, res.rows[0].id, 'INSERTED');
      verStat.inserted += 1;
    } else verStat.reused += 1;
  }

  const relStat = report.count('document_relations', data.document_relations.length);
  for (const rel of data.document_relations as {
    id: string;
    source_document_id: string;
    target_document_id: string;
    relation_type?: string | null;
    created_by?: string | null;
    created_at?: string | null;
  }[]) {
    if (!docRef(rel.source_document_id) || !docRef(rel.target_document_id)) {
      relStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_relations (id, source_document_id, target_document_id, relation_type,
                                       created_by, created_at)
       VALUES ($1,$2,$3,COALESCE($4,'BIDIRECTIONAL'),$5, COALESCE($6::timestamptz, now()))
       ON CONFLICT (source_document_id, target_document_id, relation_type) DO NOTHING
       RETURNING id`,
      [
        rel.id,
        rel.source_document_id,
        rel.target_document_id,
        rel.relation_type ?? null,
        userRef(rel.created_by),
        rel.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('document_relations', rel.id, res.rows[0].id, 'INSERTED');
      relStat.inserted += 1;
    } else relStat.reused += 1;
  }

  const permStat = report.count('document_permissions', data.document_permissions.length);
  for (const perm of data.document_permissions as {
    document_id: string;
    role: string;
    can_read?: boolean | null;
    can_write?: boolean | null;
    can_delete?: boolean | null;
    created_at?: string | null;
  }[]) {
    if (!docRef(perm.document_id) || !cat.roles.has(perm.role)) {
      permStat.skipped += 1;
      continue;
    }
    const key = `${perm.document_id}|${perm.role}`;
    const res = await client.query<{ document_id: string }>(
      `INSERT INTO document_permissions (document_id, role_code, can_read, can_write, can_delete, created_at)
       VALUES ($1,$2,COALESCE($3,true),COALESCE($4,false),COALESCE($5,false), COALESCE($6::timestamptz, now()))
       ON CONFLICT (document_id, role_code) DO NOTHING
       RETURNING document_id`,
      [
        perm.document_id,
        perm.role,
        perm.can_read ?? null,
        perm.can_write ?? null,
        perm.can_delete ?? null,
        perm.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('document_permissions', key, key, 'INSERTED');
      permStat.inserted += 1;
    } else permStat.reused += 1;
  }

  // ----------------------------------------------------------
  // 7. expedientes y sus documentos
  // ----------------------------------------------------------
  const expStat = report.count('expedientes', data.expedientes.length);
  const expedienteIds = new Set<string>();
  for (const exp of data.expedientes as {
    id: string;
    radicado: string;
    titulo: string;
    descripcion?: string | null;
    module: string;
    estado?: string | null;
    fecha_apertura?: string | null;
    fecha_cierre?: string | null;
    responsable_id?: string | null;
    serie?: string | null;
    subserie?: string | null;
    created_by?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    correspondence_type?: string | null;
    sender?: string | null;
    recipient?: string | null;
    is_correspondence?: boolean | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(exp.module));
    if (!moduleCode) {
      expStat.skipped += 1;
      report.note(`Expediente ${exp.radicado} omitido: módulo legado desconocido "${exp.module}".`);
      continue;
    }
    let correspondence = exp.correspondence_type ?? null;
    if (correspondence && !cat.correspondenceTypes.has(correspondence)) {
      report.note(
        `Tipo de correspondencia "${correspondence}" del expediente ${exp.radicado} no existe: NULL.`,
      );
      correspondence = null;
    }

    const res = await client.query<{ id: string }>(
      `INSERT INTO expedientes (id, radicado, titulo, descripcion, module_code, estado,
                                fecha_apertura, fecha_cierre, responsable_id, serie, subserie,
                                is_correspondence, correspondence_type_code, sender, recipient,
                                created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'ABIERTO'),
               COALESCE($7::date, CURRENT_DATE),$8,$9,$10,$11,
               COALESCE($12,false),$13,$14,$15,$16,
               COALESCE($17::timestamptz, now()), COALESCE($18::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        exp.id,
        exp.radicado,
        exp.titulo,
        exp.descripcion ?? null,
        moduleCode,
        exp.estado ?? null,
        exp.fecha_apertura ?? null,
        exp.fecha_cierre ?? null,
        userRef(exp.responsable_id),
        exp.serie ?? null,
        exp.subserie ?? null,
        exp.is_correspondence ?? null,
        correspondence,
        exp.sender ?? null,
        exp.recipient ?? null,
        userRef(exp.created_by),
        exp.created_at ?? null,
        exp.updated_at ?? null,
      ],
    );
    expedienteIds.add(exp.id);
    if (res.rows[0]) {
      await track.record('expedientes', exp.id, res.rows[0].id, 'INSERTED');
      expStat.inserted += 1;
    } else {
      await track.record('expedientes', exp.id, exp.id, 'REUSED');
      expStat.reused += 1;
    }
  }

  const expDocStat = report.count('expediente_documents', data.expediente_documents.length);
  for (const link of data.expediente_documents as {
    id: string;
    expediente_id: string;
    document_id: string;
    orden?: number | null;
    fecha_inclusion?: string | null;
    incluido_por?: string | null;
  }[]) {
    if (!expedienteIds.has(link.expediente_id) || !docRef(link.document_id)) {
      expDocStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO expediente_documents (id, expediente_id, document_id, orden, fecha_inclusion, incluido_por)
       VALUES ($1,$2,$3,COALESCE($4,0), COALESCE($5::timestamptz, now()), $6)
       ON CONFLICT (expediente_id, document_id) DO NOTHING
       RETURNING id`,
      [
        link.id,
        link.expediente_id,
        link.document_id,
        link.orden ?? null,
        link.fecha_inclusion ?? null,
        userRef(link.incluido_por),
      ],
    );
    if (res.rows[0]) {
      await track.record('expediente_documents', link.id, res.rows[0].id, 'INSERTED');
      expDocStat.inserted += 1;
    } else expDocStat.reused += 1;
  }

  // ----------------------------------------------------------
  // 8. Préstamos, notificaciones, eliminaciones
  // ----------------------------------------------------------
  const loanStat = report.count('document_loans', data.document_loans.length);
  for (const loan of data.document_loans as {
    id: string;
    document_id: string;
    document_title: string;
    module: string;
    loaned_to: string;
    loaned_by: string;
    loan_date?: string | null;
    expected_return_date: string;
    actual_return_date?: string | null;
    purpose: string;
    status?: string | null;
    notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(loan.module));
    const to = userRef(loan.loaned_to);
    const by = userRef(loan.loaned_by);
    if (!docRef(loan.document_id) || !moduleCode || !to || !by) {
      loanStat.skipped += 1;
      report.note(`Préstamo ${loan.id} omitido: documento, módulo o usuario sin equivalencia.`);
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO document_loans (id, document_id, document_title, module_code, loaned_to, loaned_by,
                                   loan_date, expected_return_date, actual_return_date, purpose,
                                   status, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()), $8::date, $9, $10,
               COALESCE($11,'ACTIVE'), $12,
               COALESCE($13::timestamptz, now()), COALESCE($14::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        loan.id,
        loan.document_id,
        loan.document_title,
        moduleCode,
        to,
        by,
        loan.loan_date ?? null,
        loan.expected_return_date,
        loan.actual_return_date ?? null,
        loan.purpose,
        loan.status ?? null,
        loan.notes ?? null,
        loan.created_at ?? null,
        loan.updated_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('document_loans', loan.id, res.rows[0].id, 'INSERTED');
      loanStat.inserted += 1;
    } else loanStat.reused += 1;
  }

  const notifStat = report.count('notifications', data.notifications.length);
  for (const notif of data.notifications as {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    data?: unknown;
    is_read?: boolean | null;
    created_at?: string | null;
    document_id?: string | null;
  }[]) {
    const user = userRef(notif.user_id);
    if (!user || !cat.notificationTypes.has(notif.type)) {
      notifStat.skipped += 1;
      report.note(`Notificación ${notif.id} omitida: usuario o tipo "${notif.type}" sin equivalencia.`);
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO notifications (id, user_id, type_code, title, message, document_id, data, is_read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8,false), COALESCE($9::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        notif.id,
        user,
        notif.type,
        notif.title,
        notif.message,
        notif.document_id ?? null,
        asJson(notif.data),
        notif.is_read ?? null,
        notif.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('notifications', notif.id, res.rows[0].id, 'INSERTED');
      notifStat.inserted += 1;
    } else notifStat.reused += 1;
  }

  const reqStat = report.count('deletion_requests', data.deletion_requests.length);
  for (const req of data.deletion_requests as {
    id: string;
    document_id: string;
    document_title: string;
    document_summary?: string | null;
    document_module: string;
    document_s3_key: string;
    requested_by: string;
    requested_by_name: string;
    requested_at?: string | null;
    reason: string;
    status?: string | null;
    reviewed_by?: string | null;
    reviewed_by_name?: string | null;
    reviewed_at?: string | null;
    review_notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[]) {
    const requester = userRef(req.requested_by);
    if (!requester) {
      reqStat.skipped += 1;
      continue;
    }
    const res = await client.query<{ id: string }>(
      `INSERT INTO deletion_requests (id, document_id, document_title, document_summary, document_module,
                                      document_s3_key, requested_by, requested_by_name, requested_at,
                                      reason, status, reviewed_by, reviewed_by_name, reviewed_at,
                                      review_notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()), $10, COALESCE($11,'PENDING'),
               $12,$13,$14,$15, COALESCE($16::timestamptz, now()), COALESCE($17::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        req.id,
        req.document_id,
        req.document_title,
        req.document_summary ?? null,
        req.document_module,
        req.document_s3_key,
        requester,
        req.requested_by_name,
        req.requested_at ?? null,
        req.reason,
        req.status ?? null,
        userRef(req.reviewed_by),
        req.reviewed_by_name ?? null,
        req.reviewed_at ?? null,
        req.review_notes ?? null,
        req.created_at ?? null,
        req.updated_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('deletion_requests', req.id, res.rows[0].id, 'INSERTED');
      reqStat.inserted += 1;
    } else reqStat.reused += 1;
  }

  const delStat = report.count('deletion_logs', data.deletion_logs.length);
  for (const log of data.deletion_logs as {
    id: string;
    document_id: string;
    document_title: string;
    document_summary?: string | null;
    document_module: string;
    document_s3_key: string;
    deleted_by?: string | null;
    deleted_by_name: string;
    deleted_at?: string | null;
    reason: string;
    was_request?: boolean | null;
    original_requester?: string | null;
    created_at?: string | null;
  }[]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO deletion_logs (id, document_id, document_title, document_summary, document_module,
                                  document_s3_key, deleted_by, deleted_by_name, deleted_at, reason,
                                  was_request, original_requester, acta_s3_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()), $10,
               COALESCE($11,false), $12, NULL, COALESCE($13::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        log.id,
        log.document_id,
        log.document_title,
        log.document_summary ?? null,
        log.document_module,
        log.document_s3_key,
        userRef(log.deleted_by),
        log.deleted_by_name,
        log.deleted_at ?? null,
        log.reason,
        log.was_request ?? null,
        log.original_requester ?? null,
        log.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('deletion_logs', log.id, res.rows[0].id, 'INSERTED');
      delStat.inserted += 1;
    } else delStat.reused += 1;
  }

  // ----------------------------------------------------------
  // 9. Custodia y auditoría
  // ----------------------------------------------------------
  const custStat = report.count('custody_chain', data.custody_chain.length);
  for (const event of data.custody_chain as {
    id: string;
    document_id?: string | null;
    document_title: string;
    document_module: string;
    s3_key?: string | null;
    event_type: string;
    event_details?: unknown;
    actor_id?: string | null;
    actor_email?: string | null;
    actor_role?: string | null;
    created_at?: string | null;
  }[]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO custody_chain (id, document_id, document_title, document_module, s3_key,
                                  event_type, event_details, actor_id, actor_email, actor_role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10, COALESCE($11::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        event.id,
        event.document_id ?? null,
        event.document_title,
        event.document_module,
        event.s3_key ?? null,
        event.event_type,
        asJson(event.event_details),
        userRef(event.actor_id),
        event.actor_email ?? null,
        event.actor_role ?? null,
        event.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('custody_chain', event.id, res.rows[0].id, 'INSERTED');
      custStat.inserted += 1;
    } else custStat.reused += 1;
  }

  const auditStat = report.count('audit_logs', data.audit_logs.length);
  for (const log of data.audit_logs as {
    id: string;
    user_id?: string | null;
    user_email?: string | null;
    action: string;
    resource_type?: string | null;
    resource_id?: string | null;
    details?: unknown;
    ip_address?: string | null;
    user_agent?: string | null;
    created_at?: string | null;
  }[]) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO audit_logs (id, user_id, user_email, action, resource_type, resource_id,
                               details, ip_address, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9, COALESCE($10::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        log.id,
        userRef(log.user_id),
        log.user_email ?? null,
        log.action,
        log.resource_type ?? null,
        log.resource_id ?? null,
        asJson(log.details),
        log.ip_address ?? null,
        log.user_agent ?? null,
        log.created_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('audit_logs', log.id, res.rows[0].id, 'INSERTED');
      auditStat.inserted += 1;
    } else auditStat.reused += 1;
  }

  // ----------------------------------------------------------
  // 10. role_module_access
  // ----------------------------------------------------------
  const rmaStat = report.count('role_module_access', data.role_module_access.length);
  for (const row of data.role_module_access as {
    role: string;
    module: string;
    can_read?: boolean | null;
    can_write?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(row.module));
    if (!moduleCode || !cat.roles.has(row.role)) {
      rmaStat.skipped += 1;
      continue;
    }
    const key = `${row.role}|${moduleCode}`;
    const res = await client.query<{ role_code: string }>(
      `INSERT INTO role_module_access (role_code, module_code, can_read, can_write, created_at, updated_at)
       VALUES ($1,$2,COALESCE($3,false),COALESCE($4,false),
               COALESCE($5::timestamptz, now()), COALESCE($6::timestamptz, now()))
       ON CONFLICT (role_code, module_code) DO UPDATE
          SET can_read = role_module_access.can_read OR EXCLUDED.can_read,
              can_write = role_module_access.can_write OR EXCLUDED.can_write
        WHERE role_module_access.can_read IS DISTINCT FROM (role_module_access.can_read OR EXCLUDED.can_read)
           OR role_module_access.can_write IS DISTINCT FROM (role_module_access.can_write OR EXCLUDED.can_write)
       RETURNING role_code`,
      [
        row.role,
        moduleCode,
        row.can_read ?? null,
        row.can_write ?? null,
        row.created_at ?? null,
        row.updated_at ?? null,
      ],
    );
    if (res.rows[0]) {
      await track.record('role_module_access', key, key, 'UPDATED');
      rmaStat.inserted += 1;
    } else rmaStat.reused += 1;
  }
  report.note(
    'role_module_access: la matriz sembrada es la base; del legado solo se AÑADEN permisos (unión lógica), nunca se retiran.',
  );

  // ----------------------------------------------------------
  // 11. system_config
  // ----------------------------------------------------------
  const cfgStat = report.count('system_config', data.system_config.length);
  const legacyConfig = new Map(data.system_config.map((c) => [c.key, c.value]));

  // 11.a AWS cifrado (se prefiere `aws_config`; `aws_s3` es el respaldo antiguo)
  const awsSchema = z.object({
    region: z.string().min(1),
    bucket: z.string().min(1),
    base_folder: z.string().optional().default(''),
    access_key_id: z.string().min(1),
    secret_access_key: z.string().min(1),
  });
  const awsSource = legacyConfig.has('aws_config')
    ? 'aws_config'
    : legacyConfig.has('aws_s3')
      ? 'aws_s3'
      : null;
  if (awsSource) {
    const aws = awsSchema.safeParse(legacyConfig.get(awsSource));
    if (!aws.success) {
      cfgStat.skipped += 1;
      report.note(`"${awsSource}" legado no tiene la forma esperada: no se importó.`);
    } else {
      const current = (
        await client.query<{ value: unknown; is_secret: boolean }>(
          "SELECT value, is_secret FROM system_config WHERE key = 'aws_config'",
        )
      ).rows[0];

      let already = false;
      if (current?.value && typeof current.value === 'string') {
        try {
          already = JSON.stringify(decryptJson(current.value)) === JSON.stringify(aws.data);
        } catch {
          already = false;
        }
      }

      if (already) {
        cfgStat.reused += 1;
        report.note('aws_config ya estaba cifrado con el mismo valor: no se tocó.');
      } else if (current && current.value !== null) {
        cfgStat.skipped += 1;
        report.note(
          'aws_config ya tenía un valor distinto en la base: NO se sobrescribió (revisar manualmente).',
        );
      } else {
        const encrypted = JSON.stringify(encryptJson(aws.data));
        await client.query(
          `INSERT INTO system_config (key, value, is_secret, description, updated_by, updated_at)
           VALUES ('aws_config', $1::jsonb, true, $2, $3, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, is_secret = true, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [
            encrypted,
            'Credenciales y bucket de AWS S3 (importado del sistema legado, cifrado AES-256-GCM)',
            adminId,
          ],
        );
        await track.record('system_config.value', 'aws_config', 'aws_config', 'INSERTED');
        cfgStat.inserted += 1;
        report.note(
          `Credenciales AWS importadas desde "${awsSource}" y guardadas CIFRADAS (AES-256-GCM) en system_config.aws_config. No se imprimen.`,
        );
      }
    }
  } else {
    report.note('No se encontró configuración AWS en el legado.');
  }

  // 11.b app_settings → claves equivalentes
  const appSettings = legacyConfig.get('app_settings') as Record<string, unknown> | undefined;
  if (appSettings) {
    const targets: { key: string; value: unknown; description: string }[] = [];
    const push = (key: string, raw: unknown, description: string): void => {
      if (typeof raw === 'string' && raw.trim() === '') return;
      if (raw === null || raw === undefined) return;
      targets.push({ key, value: raw, description });
    };
    push('institution_name', appSettings.institution_name, 'Nombre de la institución');
    push('app_name', appSettings.app_name, 'Nombre visible de la aplicación');
    push('ui_theme', appSettings.theme, 'Tema visual por defecto de la interfaz');
    push('logo_url', appSettings.logo_url, 'URL del logotipo institucional');

    for (const target of targets) {
      const current = (
        await client.query<{ value: unknown }>('SELECT value FROM system_config WHERE key = $1', [target.key])
      ).rows[0];

      if (!current) {
        await client.query(
          `INSERT INTO system_config (key, value, is_secret, description, updated_by, updated_at)
           VALUES ($1, $2::jsonb, false, $3, $4, now())
           ON CONFLICT (key) DO NOTHING`,
          [target.key, JSON.stringify(target.value), target.description, adminId],
        );
        await track.record('system_config.key', target.key, target.key, 'INSERTED');
        cfgStat.inserted += 1;
        report.note(`app_settings.${target.key} → nueva clave system_config.${target.key}.`);
      } else if (JSON.stringify(current.value) === JSON.stringify(target.value)) {
        cfgStat.reused += 1;
      } else if (current.value === null) {
        await client.query(
          'UPDATE system_config SET value = $2::jsonb, updated_by = $3, updated_at = now() WHERE key = $1',
          [target.key, JSON.stringify(target.value), adminId],
        );
        await track.record('system_config.value', target.key, target.key, 'INSERTED');
        cfgStat.inserted += 1;
      } else {
        cfgStat.skipped += 1;
        report.note(
          `system_config.${target.key} ya tenía un valor sembrado distinto: se conservó el de las semillas (legado: ${JSON.stringify(target.value)}).`,
        );
      }
    }
  }

  // 11.c claves legadas sin equivalente
  for (const key of legacyConfig.keys()) {
    if (key === 'aws_config' || key === 'aws_s3' || key === 'app_settings') continue;
    cfgStat.skipped += 1;
    report.note(
      `system_config.${key} legado no tiene equivalente en el esquema nuevo (la retención vive ahora en la tabla retention_rules): omitido.`,
    );
  }
  if (awsSource === 'aws_config' && legacyConfig.has('aws_s3')) {
    report.note('Se descartó "aws_s3" (bucket antiguo) en favor de "aws_config", que es el vigente.');
  }

  // ----------------------------------------------------------
  // 12. Contadores de folio y radicado
  // ----------------------------------------------------------
  const folioStat = report.count('folio_counters (ajuste)', 0);
  const folioMax = new Map<string, number>();
  for (const doc of data.documents as {
    module: string;
    folio_index?: string | null;
    created_at?: string | null;
  }[]) {
    if (!doc.folio_index) continue;
    const moduleCode = cat.moduleByText.get(normalize(doc.module));
    if (!moduleCode) continue;
    const seq = trailingSeq(doc.folio_index);
    if (seq === null) continue;
    const year = embeddedYear(doc.folio_index) ?? yearOf(doc.created_at) ?? new Date().getUTCFullYear();
    const key = `${moduleCode}|${year}`;
    folioMax.set(key, Math.max(folioMax.get(key) ?? 0, seq));
  }
  folioStat.legacy = folioMax.size;

  for (const [key, max] of folioMax) {
    const [moduleCode, yearText] = key.split('|');
    const year = Number(yearText);
    const current = (
      await client.query<{ last_value: number }>(
        'SELECT last_value FROM folio_counters WHERE module_code = $1 AND year = $2',
        [moduleCode, year],
      )
    ).rows[0];

    if (!current) {
      await client.query('INSERT INTO folio_counters (module_code, year, last_value) VALUES ($1,$2,$3)', [
        moduleCode,
        year,
        max,
      ]);
      await track.record('folio_counters', key, '0', 'INSERTED');
      folioStat.inserted += 1;
    } else if (current.last_value < max) {
      await client.query('UPDATE folio_counters SET last_value = $3 WHERE module_code = $1 AND year = $2', [
        moduleCode,
        year,
        max,
      ]);
      await track.record('folio_counters', key, String(current.last_value), 'UPDATED');
      folioStat.inserted += 1;
    } else {
      folioStat.reused += 1;
    }
  }

  const radStat = report.count('radicado_counters (ajuste)', 0);
  const radMax = new Map<string, number>();
  for (const exp of data.expedientes as {
    module: string;
    radicado: string;
    is_correspondence?: boolean | null;
    correspondence_type?: string | null;
    fecha_apertura?: string | null;
    created_at?: string | null;
  }[]) {
    const moduleCode = cat.moduleByText.get(normalize(exp.module));
    if (!moduleCode) continue;
    const seq = trailingSeq(exp.radicado);
    if (seq === null) continue;
    const year =
      embeddedYear(exp.radicado) ??
      yearOf(exp.fecha_apertura ?? exp.created_at) ??
      new Date().getUTCFullYear();
    const kind =
      exp.is_correspondence && exp.correspondence_type && cat.correspondenceTypes.has(exp.correspondence_type)
        ? exp.correspondence_type
        : 'EXPEDIENTE';
    const key = `${moduleCode}|${year}|${kind}`;
    radMax.set(key, Math.max(radMax.get(key) ?? 0, seq));
  }
  radStat.legacy = radMax.size;

  for (const [key, max] of radMax) {
    const [moduleCode, yearText, kind] = key.split('|');
    const year = Number(yearText);
    const current = (
      await client.query<{ last_value: number }>(
        'SELECT last_value FROM radicado_counters WHERE module_code = $1 AND year = $2 AND kind = $3',
        [moduleCode, year, kind],
      )
    ).rows[0];

    if (!current) {
      await client.query(
        'INSERT INTO radicado_counters (module_code, year, kind, last_value) VALUES ($1,$2,$3,$4)',
        [moduleCode, year, kind, max],
      );
      await track.record('radicado_counters', key, '0', 'INSERTED');
      radStat.inserted += 1;
    } else if (current.last_value < max) {
      await client.query(
        'UPDATE radicado_counters SET last_value = $4 WHERE module_code = $1 AND year = $2 AND kind = $3',
        [moduleCode, year, kind, max],
      );
      await track.record('radicado_counters', key, String(current.last_value), 'UPDATED');
      radStat.inserted += 1;
    } else {
      radStat.reused += 1;
    }
  }

  await client.query('ALTER TABLE documents ENABLE TRIGGER trg_documents_updated');

  return { credentials };
}

// ============================================================
// ROLLBACK
// ============================================================
/** Orden inverso al de importación. */
const ROLLBACK_PLAN: { table: string; kind: 'row' | 'special' }[] = [
  { table: 'radicado_counters', kind: 'special' },
  { table: 'folio_counters', kind: 'special' },
  { table: 'system_config.value', kind: 'special' },
  { table: 'system_config.key', kind: 'special' },
  { table: 'role_module_access', kind: 'special' },
  { table: 'audit_logs', kind: 'row' },
  { table: 'custody_chain', kind: 'row' },
  { table: 'deletion_logs', kind: 'row' },
  { table: 'deletion_requests', kind: 'row' },
  { table: 'notifications', kind: 'row' },
  { table: 'document_loans', kind: 'row' },
  { table: 'expediente_documents', kind: 'row' },
  { table: 'expedientes', kind: 'row' },
  { table: 'document_permissions', kind: 'special' },
  { table: 'document_relations', kind: 'row' },
  { table: 'document_versions', kind: 'row' },
  { table: 'document_notes', kind: 'row' },
  { table: 'document_metadata', kind: 'row' },
  { table: 'document_tags', kind: 'row' },
  { table: 'document_approvals', kind: 'row' },
  { table: 'documents', kind: 'row' },
  { table: 'retention_rules', kind: 'row' },
  { table: 'document_categories', kind: 'row' },
  { table: 'users', kind: 'special' },
  { table: 'users.id_reassigned', kind: 'special' },
  { table: 'roles', kind: 'special' },
];

async function rollbackAll(client: PoolClient, report: Report): Promise<void> {
  const rows = (
    await client.query<{ legacy_table: string; legacy_id: string; new_id: string; action: Action }>(
      'SELECT legacy_table, legacy_id, new_id, action FROM legacy_migration_map',
    )
  ).rows;

  if (rows.length === 0) {
    report.note('`legacy_migration_map` está vacía: no hay nada que revertir.');
    return;
  }

  const byTable = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTable.get(row.legacy_table) ?? [];
    list.push(row);
    byTable.set(row.legacy_table, list);
  }

  await client.query('ALTER TABLE documents DISABLE TRIGGER trg_documents_updated');

  for (const step of ROLLBACK_PLAN) {
    const list = byTable.get(step.table);
    if (!list || list.length === 0) continue;
    const stat = report.count(step.table, list.length);

    for (const row of list) {
      if (step.kind === 'row') {
        if (row.action !== 'INSERTED') {
          stat.skipped += 1;
          continue;
        }
        const res = await client.query(`DELETE FROM ${step.table} WHERE id = $1::uuid`, [row.new_id]);
        stat.inserted += res.rowCount ?? 0;
        continue;
      }

      switch (step.table) {
        case 'radicado_counters':
        case 'folio_counters': {
          const [moduleCode, yearText, kind] = row.legacy_id.split('|');
          const year = Number(yearText);
          if (row.action === 'INSERTED') {
            const res =
              step.table === 'folio_counters'
                ? await client.query('DELETE FROM folio_counters WHERE module_code = $1 AND year = $2', [
                    moduleCode,
                    year,
                  ])
                : await client.query(
                    'DELETE FROM radicado_counters WHERE module_code = $1 AND year = $2 AND kind = $3',
                    [moduleCode, year, kind],
                  );
            stat.inserted += res.rowCount ?? 0;
          } else if (row.action === 'UPDATED') {
            const previous = Number(row.new_id);
            const res =
              step.table === 'folio_counters'
                ? await client.query(
                    'UPDATE folio_counters SET last_value = $3 WHERE module_code = $1 AND year = $2',
                    [moduleCode, year, previous],
                  )
                : await client.query(
                    'UPDATE radicado_counters SET last_value = $4 WHERE module_code = $1 AND year = $2 AND kind = $3',
                    [moduleCode, year, kind, previous],
                  );
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        case 'system_config.value': {
          if (row.action === 'INSERTED') {
            const res = await client.query(
              'UPDATE system_config SET value = NULL, updated_at = now() WHERE key = $1',
              [row.legacy_id],
            );
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        case 'system_config.key': {
          if (row.action === 'INSERTED') {
            const res = await client.query('DELETE FROM system_config WHERE key = $1', [row.legacy_id]);
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        case 'role_module_access': {
          // Solo se añadieron permisos; se revierte a la matriz sembrada ejecutando db:seed.
          stat.skipped += 1;
          break;
        }
        case 'document_permissions': {
          if (row.action === 'INSERTED') {
            const [documentId, roleCode] = row.legacy_id.split('|');
            const res = await client.query(
              'DELETE FROM document_permissions WHERE document_id = $1::uuid AND role_code = $2',
              [documentId, roleCode],
            );
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        case 'users': {
          if (row.action === 'INSERTED') {
            const res = await client.query('DELETE FROM users WHERE id = $1::uuid', [row.new_id]);
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        case 'users.id_reassigned': {
          const res = await client.query('UPDATE users SET id = $1::uuid WHERE id = $2::uuid', [
            row.new_id,
            row.legacy_id,
          ]);
          stat.inserted += res.rowCount ?? 0;
          break;
        }
        case 'roles': {
          if (row.action === 'INSERTED') {
            const res = await client.query('DELETE FROM roles WHERE code = $1 AND is_system = false', [
              row.new_id,
            ]);
            stat.inserted += res.rowCount ?? 0;
          } else stat.skipped += 1;
          break;
        }
        default:
          stat.skipped += 1;
      }
    }
  }

  await client.query('ALTER TABLE documents ENABLE TRIGGER trg_documents_updated');
  await client.query('DELETE FROM legacy_migration_map');
  report.note(
    'role_module_access no se revierte fila a fila (solo se añadieron permisos): ejecuta `npm run db:seed` si quieres la matriz canónica.',
  );
}

// ============================================================
// Verificación de conteos legado vs. base nueva
// ============================================================
const COUNT_CHECKS: { legacy: LegacyName; sql: string }[] = [
  { legacy: 'profiles', sql: 'SELECT count(*)::int AS n FROM users' },
  { legacy: 'documents', sql: 'SELECT count(*)::int AS n FROM documents' },
  { legacy: 'document_tags', sql: 'SELECT count(*)::int AS n FROM document_tags' },
  { legacy: 'document_metadata', sql: 'SELECT count(*)::int AS n FROM document_metadata' },
  { legacy: 'document_notes', sql: 'SELECT count(*)::int AS n FROM document_notes' },
  { legacy: 'document_versions', sql: 'SELECT count(*)::int AS n FROM document_versions' },
  { legacy: 'document_relations', sql: 'SELECT count(*)::int AS n FROM document_relations' },
  { legacy: 'document_permissions', sql: 'SELECT count(*)::int AS n FROM document_permissions' },
  { legacy: 'expedientes', sql: 'SELECT count(*)::int AS n FROM expedientes' },
  { legacy: 'expediente_documents', sql: 'SELECT count(*)::int AS n FROM expediente_documents' },
  { legacy: 'document_loans', sql: 'SELECT count(*)::int AS n FROM document_loans' },
  { legacy: 'notifications', sql: 'SELECT count(*)::int AS n FROM notifications' },
  { legacy: 'custody_chain', sql: 'SELECT count(*)::int AS n FROM custody_chain' },
  { legacy: 'audit_logs', sql: 'SELECT count(*)::int AS n FROM audit_logs' },
  { legacy: 'deletion_logs', sql: 'SELECT count(*)::int AS n FROM deletion_logs' },
  { legacy: 'deletion_requests', sql: 'SELECT count(*)::int AS n FROM deletion_requests' },
  { legacy: 'retention_rules', sql: 'SELECT count(*)::int AS n FROM retention_rules' },
  { legacy: 'document_categories', sql: 'SELECT count(*)::int AS n FROM document_categories' },
  { legacy: 'role_module_access', sql: 'SELECT count(*)::int AS n FROM role_module_access' },
  { legacy: 'role_permissions', sql: 'SELECT count(*)::int AS n FROM roles' },
  { legacy: 'system_config', sql: 'SELECT count(*)::int AS n FROM system_config' },
];

async function printSideBySide(client: PoolClient, data: LegacyData): Promise<void> {
  console.log('\nConteos: JSON legado vs. filas en `eduarchive`');
  console.log(`${'tabla legada'.padEnd(24)} | ${'JSON'.padStart(6)} | ${'eduarchive'.padStart(10)}`);
  console.log(`${'-'.repeat(24)}-+--------+-----------`);
  for (const check of COUNT_CHECKS) {
    const legacyCount = data[check.legacy].length;
    const dbCount = (await client.query<{ n: number }>(check.sql)).rows[0]?.n ?? 0;
    console.log(
      `${check.legacy.padEnd(24)} | ${String(legacyCount).padStart(6)} | ${String(dbCount).padStart(10)}`,
    );
  }
}

// ============================================================
// Prueba de contadores (genera y revierte)
// ============================================================
async function testCounters(client: PoolClient): Promise<void> {
  const target = (
    await client.query<{ id: string; module_code: string; folio_index: string | null }>(
      `SELECT d.id, d.module_code, d.folio_index
         FROM documents d
        WHERE d.deleted_at IS NULL
        ORDER BY d.created_at
        LIMIT 1`,
    )
  ).rows[0];
  if (!target) {
    console.log('  (sin documentos para probar el contador de folios)');
    return;
  }

  await client.query('SAVEPOINT sp_counter_test');
  try {
    const folio = (
      await client.query<{ assign_folio: string }>('SELECT assign_folio($1, NULL) AS assign_folio', [
        target.id,
      ])
    ).rows[0]?.assign_folio;
    const radicado = (
      await client.query<{ generate_radicado: string }>(
        'SELECT generate_radicado($1, $2) AS generate_radicado',
        [target.module_code, 'EXPEDIENTE'],
      )
    ).rows[0]?.generate_radicado;
    const collision = (
      await client.query<{ n: number }>('SELECT count(*)::int AS n FROM documents WHERE folio_index = $1', [
        folio,
      ])
    ).rows[0]?.n;

    console.log(
      `  · Folio de prueba en ${target.module_code}: ${folio} (colisiones: ${(collision ?? 0) - 1})`,
    );
    console.log(`  · Radicado de prueba en ${target.module_code}: ${radicado}`);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT sp_counter_test');
    await client.query('RELEASE SAVEPOINT sp_counter_test');
    console.log('  · Prueba revertida (ROLLBACK del savepoint): los contadores quedan como estaban.');
  }
}

// ============================================================
// Credenciales temporales
// ============================================================
async function writeCredentials(credentials: Credential[], dryRun: boolean): Promise<void> {
  if (credentials.length === 0) {
    console.log(
      '\nNo se generaron contraseñas temporales nuevas (todos los usuarios ya existían y se reutilizaron sin tocar su contraseña).',
    );
    return;
  }

  const width = Math.max(30, ...credentials.map((c) => c.email.length));
  console.log('\nContraseñas temporales (must_change_password = true):');
  console.log(`${'email'.padEnd(width)} | contraseña temporal`);
  console.log(`${'-'.repeat(width)}-+--------------------`);
  for (const c of credentials) console.log(`${c.email.padEnd(width)} | ${c.password}`);

  if (dryRun) {
    console.log('\n(--dry-run: no se escribió el archivo de credenciales)');
    return;
  }

  const body = [
    '# Contraseñas temporales generadas por migrate-legacy',
    `# Generado: ${new Date().toISOString()}`,
    '# Todos los usuarios tienen must_change_password = true.',
    '# BORRA ESTE ARCHIVO en cuanto entregues las contraseñas.',
    '',
    ...credentials.map((c) => `${c.email}\t${c.password}`),
    '',
  ].join('\n');
  await fs.writeFile(CREDENTIALS_FILE, body, { encoding: 'utf8', mode: 0o600 });
  console.log(`\nGuardadas en: ${CREDENTIALS_FILE}`);
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = new Report();

  const mode = options.rollback ? 'ROLLBACK' : 'IMPORTACIÓN';
  console.log(`=== Migración legada · modo ${mode}${options.dryRun ? ' (--dry-run)' : ''} ===`);
  console.log(`Origen: ${options.source}`);

  const data = await loadLegacy(options.source);
  console.log(`Archivos leídos y validados: ${Object.keys(schemas).length}`);

  const client = await pool.connect();
  let credentials: Credential[] = [];
  try {
    await client.query('BEGIN');

    const hasMap = (
      await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.legacy_migration_map') IS NOT NULL AS exists",
      )
    ).rows[0]?.exists;
    if (!hasMap) {
      throw new Error(
        'Falta la tabla `legacy_migration_map`. Ejecuta primero: npm --prefix server run db:migrate',
      );
    }

    if (options.rollback) {
      await rollbackAll(client, report);
    } else {
      credentials = (await importAll(client, data, report)).credentials;
    }

    await printSideBySide(client, data);

    if (!options.rollback) {
      console.log('\nPrueba de contadores (folio y radicado):');
      await testCounters(client);
    }

    if (options.dryRun) {
      await client.query('ROLLBACK');
      console.log('\n--dry-run: se revirtió TODO. La base no cambió.');
    } else {
      await client.query('COMMIT');
      console.log(`\n${mode} confirmada (COMMIT).`);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  report.print(options.rollback ? 'Resumen del rollback' : 'Resumen de la migración');
  if (!options.rollback) await writeCredentials(credentials, options.dryRun);
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error: Error) => {
    console.error(`\n✖ ${error.message}`);
    await closePool();
    process.exit(1);
  });
