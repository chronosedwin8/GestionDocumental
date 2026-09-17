-- ============================================================
-- SEMILLA 001 — Catálogos base (idempotente)
-- ============================================================

-- Módulos departamentales (11). Prefijos de folio/radicado y carpeta S3
-- viven aquí: el código nunca los deduce.
INSERT INTO modules (code, name, description, icon, color, s3_folder, folio_prefix, radicado_prefix, sort_order, is_active) VALUES
  ('ACADEMIC',        'Gestión Académica',    'Expediente Único del Estudiante',            'GraduationCap', '#3b82f6', 'academico',        'ACAD', 'AC',  1, true),
  ('HUMAN_RESOURCES', 'Talento Humano',       'Historia Laboral y Contratación',            'Briefcase',     '#a855f7', 'talento-humano',   'RRHH', 'TH',  2, true),
  ('FINANCIAL',       'Contable y Financiero','Nómina, Facturación y Presupuesto',          'Calculator',    '#10b981', 'financiero',       'CONT', 'FI',  3, true),
  ('ADMINISTRATIVE',  'Administrativo',       'Correspondencia y Actas',                    'Building2',     '#f97316', 'administrativo',   'ADMI', 'AD',  4, true),
  ('LEGAL',           'Legales',              'Contratos y normativa',                      'Scale',         '#ef4444', 'legales',          'LEGA', 'LE',  5, true),
  ('TECHNOLOGY',      'Tecnológico',          'TI, sistemas e infraestructura tecnológica', 'Cpu',           '#06b6d4', 'tecnologico',      'TECH', 'TI',  6, true),
  ('COMMUNICATIONS',  'Comunicaciones',       'Comunicados y relaciones externas',          'Radio',         '#0ea5e9', 'comunicaciones',   'COMU', 'CM',  7, true),
  ('PURCHASING',      'Gestión de Compras',   'Proveedores y adquisiciones',                'ShoppingCart',  '#f59e0b', 'compras',          'COMP', 'GC',  8, true),
  ('INFRASTRUCTURE',  'Infraestructura',      'Planta física y mantenimiento',              'Hammer',        '#a8a29e', 'infraestructura',  'INFR', 'IF',  9, true),
  ('HEALTH_SAFETY',   'Seguridad y Salud',    'SST y bienestar laboral',                    'HeartPulse',    '#fb7185', 'seguridad-salud',  'SYSO', 'SS', 10, true),
  ('BOARD',           'Junta Directiva',      'Actas y decisiones de junta',                'Crown',         '#a78bfa', 'junta-directiva',  'JDIR', 'JD', 11, true)
ON CONFLICT (code) DO NOTHING;

-- Roles
INSERT INTO roles (code, name, description, has_full_access, can_manage_users, is_system, sort_order) VALUES
  ('ADMIN',          'Administrador',        'Acceso total al sistema y a la configuración',                   true,  true,  true,  1),
  ('RECTOR',         'Rectoría',             'Acceso total de consulta y gobierno institucional',              true,  true,  true,  2),
  ('ARCHIVISTA',     'Archivista',           'Gestión documental transversal: clasifica, folía y transfiere',  false, false, true,  3),
  ('AUDITOR',        'Auditor',              'Solo lectura de todos los módulos y de la auditoría',            false, false, true,  4),
  ('DOCENTE',        'Docente',              'Personal docente del área académica',                            false, false, true,  5),
  ('ADMINISTRATIVO', 'Administrativo',       'Personal de secretaría general y administración',                false, false, true,  6),
  ('RRHH',           'Talento Humano',       'Personal del área de talento humano',                            false, false, true,  7),
  ('CONTADOR',       'Contabilidad',         'Personal del área contable y financiera',                        false, false, true,  8),
  ('SIN_ASIGNAR',    'Sin asignar',          'Usuario creado sin permisos asignados',                          false, false, true,  9)
ON CONFLICT (code) DO NOTHING;

-- Estados archivísticos del documento
INSERT INTO document_statuses (code, name, color, is_terminal, allows_edit, sort_order) VALUES
  ('ARCHIVO_GESTION',         'Archivo de Gestión',       '#3b82f6', false, true,  1),
  ('ARCHIVO_CENTRAL',         'Archivo Central',          '#f59e0b', false, true,  2),
  ('ARCHIVO_HISTORICO',       'Archivo Histórico',        '#8b5cf6', false, false, 3),
  ('CONSERVACION_PERMANENTE', 'Conservación Permanente',  '#10b981', true,  false, 4),
  ('BLOQUEO_ADMIN',           'Bloqueo Administrativo',   '#ef4444', false, false, 5),
  ('APROBADO',                'Aprobado',                 '#22c55e', true,  false, 6)
ON CONFLICT (code) DO NOTHING;

-- Disposiciones finales (TRD)
INSERT INTO dispositions (code, name, color, action) VALUES
  ('CONSERVAR',   'Conservación total',   '#10b981', 'KEEP'),
  ('SELECCIONAR', 'Selección documental', '#f59e0b', 'SELECT'),
  ('ELIMINAR',    'Eliminación',          '#ef4444', 'DELETE')
ON CONFLICT (code) DO NOTHING;

-- Tipos de notificación
INSERT INTO notification_types (code, name, icon, color) VALUES
  ('LOAN',               'Préstamo de documento',       'BookMarked',  '#3b82f6'),
  ('OVERDUE',            'Préstamo vencido',            'AlarmClock',  '#ef4444'),
  ('TRANSFER',           'Transferencia documental',    'ArrowRightLeft', '#8b5cf6'),
  ('RETENTION_ALERT',    'Alerta de retención',         'CalendarClock', '#f59e0b'),
  ('DELETION_REQUEST',   'Solicitud de eliminación',    'Trash2',      '#ef4444'),
  ('DELETION_APPROVED',  'Eliminación aprobada',        'CheckCircle', '#22c55e'),
  ('DELETION_REJECTED',  'Eliminación rechazada',       'XCircle',     '#f97316'),
  ('DOCUMENT_SHARED',    'Documento compartido',        'Share2',      '#06b6d4'),
  ('EXPEDIENTE_CLOSED',  'Expediente cerrado',          'FolderCheck', '#10b981'),
  ('CORRESPONDENCE_DUE', 'Correspondencia por vencer',  'MailWarning', '#f59e0b'),
  ('INFO',               'Información',                 'Info',        '#64748b')
ON CONFLICT (code) DO NOTHING;

-- Tipos de correspondencia (Acuerdo AGN 060/2001)
INSERT INTO correspondence_types (code, name, prefix, response_days) VALUES
  ('ENTRANTE', 'Correspondencia entrante', 'E', 15),
  ('SALIENTE', 'Correspondencia saliente', 'S', NULL),
  ('INTERNA',  'Comunicación interna',     'I', 10)
ON CONFLICT (code) DO NOTHING;

-- Tipos de persona
INSERT INTO person_types (code, name) VALUES
  ('EMPLOYEE',    'Empleado'),
  ('STUDENT',     'Estudiante'),
  ('THIRD_PARTY', 'Tercero')
ON CONFLICT (code) DO NOTHING;

-- Periodo académico del año en curso (el admin puede editarlo o crear otros)
INSERT INTO academic_periods (name, start_date, end_date, is_current)
SELECT 'Año lectivo ' || EXTRACT(YEAR FROM now())::TEXT,
       make_date(EXTRACT(YEAR FROM now())::INT, 1, 1),
       make_date(EXTRACT(YEAR FROM now())::INT, 12, 31),
       true
WHERE NOT EXISTS (SELECT 1 FROM academic_periods);
