-- ============================================================
-- SEMILLA 002 — Matriz de acceso rol → módulo
-- Los triggers de `modules`/`roles` crean las filas en false;
-- aquí se aplican los valores por defecto SOLO si la fila sigue
-- sin tocar (false/false), para no pisar cambios del administrador.
-- ============================================================

-- Roles con lectura y escritura en todos los módulos
INSERT INTO role_module_access (role_code, module_code, can_read, can_write)
SELECT r.code, m.code, true, true
  FROM roles r CROSS JOIN modules m
 WHERE r.code IN ('ADMIN', 'RECTOR', 'ARCHIVISTA')
ON CONFLICT (role_code, module_code) DO UPDATE
   SET can_read = true, can_write = true
 WHERE role_module_access.can_read = false AND role_module_access.can_write = false;

-- Auditor: lectura de todo, sin escritura
INSERT INTO role_module_access (role_code, module_code, can_read, can_write)
SELECT 'AUDITOR', m.code, true, false FROM modules m
ON CONFLICT (role_code, module_code) DO UPDATE
   SET can_read = true, can_write = false
 WHERE role_module_access.can_read = false AND role_module_access.can_write = false;

-- Roles departamentales
INSERT INTO role_module_access (role_code, module_code, can_read, can_write) VALUES
  ('DOCENTE',        'ACADEMIC',        true,  true),
  ('DOCENTE',        'COMMUNICATIONS',  true,  false),
  ('DOCENTE',        'HEALTH_SAFETY',   true,  false),

  ('CONTADOR',       'FINANCIAL',       true,  true),
  ('CONTADOR',       'PURCHASING',      true,  true),
  ('CONTADOR',       'LEGAL',           true,  false),

  ('RRHH',           'HUMAN_RESOURCES', true,  true),
  ('RRHH',           'HEALTH_SAFETY',   true,  true),

  ('ADMINISTRATIVO', 'ADMINISTRATIVE',  true,  true),
  ('ADMINISTRATIVO', 'COMMUNICATIONS',  true,  true),
  ('ADMINISTRATIVO', 'PURCHASING',      true,  true),
  ('ADMINISTRATIVO', 'INFRASTRUCTURE',  true,  true),
  ('ADMINISTRATIVO', 'LEGAL',           true,  false),
  ('ADMINISTRATIVO', 'TECHNOLOGY',      true,  false),
  ('ADMINISTRATIVO', 'HEALTH_SAFETY',   true,  false)
ON CONFLICT (role_code, module_code) DO UPDATE
   SET can_read  = EXCLUDED.can_read,
       can_write = EXCLUDED.can_write
 WHERE role_module_access.can_read = false AND role_module_access.can_write = false;
