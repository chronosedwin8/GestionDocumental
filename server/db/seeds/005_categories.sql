-- ============================================================
-- SEMILLA 005 — Categorías documentales jerárquicas por módulo
-- Portada de la migración legada 07 (`module` → `module_code`).
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  pid UUID;
BEGIN

  -- ========================
  -- MÓDULO: ACADEMIC
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Planeación Académica', 'Series de planeación curricular y pedagógica', '#3b82f6', 'ACADEMIC', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Planeación Académica' AND module_code = 'ACADEMIC' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Planes de área',           '#3b82f6', 'ACADEMIC', pid, 1, true),
    ('Planes de aula',           '#3b82f6', 'ACADEMIC', pid, 2, true),
    ('Mallas curriculares',      '#3b82f6', 'ACADEMIC', pid, 3, true),
    ('Proyectos pedagógicos',    '#3b82f6', 'ACADEMIC', pid, 4, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Evaluación', 'Documentos de evaluación y resultados', '#3b82f6', 'ACADEMIC', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Evaluación' AND module_code = 'ACADEMIC' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Exámenes',                      '#3b82f6', 'ACADEMIC', pid, 1, true),
    ('Rúbricas',                      '#3b82f6', 'ACADEMIC', pid, 2, true),
    ('Informes de desempeño',         '#3b82f6', 'ACADEMIC', pid, 3, true),
    ('Resultados pruebas externas',   '#3b82f6', 'ACADEMIC', pid, 4, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Gestión de Clases', 'Horarios, asistencia y seguimiento', '#3b82f6', 'ACADEMIC', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Gestión de Clases' AND module_code = 'ACADEMIC' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Horarios',               '#3b82f6', 'ACADEMIC', pid, 1, true),
    ('Listas de asistencia',   '#3b82f6', 'ACADEMIC', pid, 2, true),
    ('Seguimiento académico',  '#3b82f6', 'ACADEMIC', pid, 3, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Material Didáctico', 'Recursos pedagógicos y materiales de apoyo', '#3b82f6', 'ACADEMIC', NULL, 4, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Material Didáctico' AND module_code = 'ACADEMIC' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Guías',             '#3b82f6', 'ACADEMIC', pid, 1, true),
    ('Talleres',          '#3b82f6', 'ACADEMIC', pid, 2, true),
    ('Recursos digitales','#3b82f6', 'ACADEMIC', pid, 3, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: HUMAN_RESOURCES
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Vinculación', 'Documentos de ingreso y contratación de personal', '#f59e0b', 'HUMAN_RESOURCES', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Vinculación' AND module_code = 'HUMAN_RESOURCES' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Hojas de vida',        '#f59e0b', 'HUMAN_RESOURCES', pid, 1, true),
    ('Contratos laborales',  '#f59e0b', 'HUMAN_RESOURCES', pid, 2, true),
    ('Actas de ingreso',     '#f59e0b', 'HUMAN_RESOURCES', pid, 3, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Desempeño', 'Evaluaciones y planes de mejora del personal', '#f59e0b', 'HUMAN_RESOURCES', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Desempeño' AND module_code = 'HUMAN_RESOURCES' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Evaluaciones docentes',     '#f59e0b', 'HUMAN_RESOURCES', pid, 1, true),
    ('Planes de mejoramiento',    '#f59e0b', 'HUMAN_RESOURCES', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Formación', 'Capacitaciones y desarrollo profesional', '#f59e0b', 'HUMAN_RESOURCES', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Formación' AND module_code = 'HUMAN_RESOURCES' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Certificados de capacitación', '#f59e0b', 'HUMAN_RESOURCES', pid, 1, true),
    ('Planes de formación',          '#f59e0b', 'HUMAN_RESOURCES', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Nómina', 'Documentos de pago y reportes de nómina', '#f59e0b', 'HUMAN_RESOURCES', NULL, 4, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Nómina' AND module_code = 'HUMAN_RESOURCES' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Desprendibles de pago', '#f59e0b', 'HUMAN_RESOURCES', pid, 1, true),
    ('Reportes de nómina',    '#f59e0b', 'HUMAN_RESOURCES', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: FINANCIAL
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Presupuesto', 'Planeación y ejecución presupuestal', '#10b981', 'FINANCIAL', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Presupuesto' AND module_code = 'FINANCIAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Presupuesto anual',       '#10b981', 'FINANCIAL', pid, 1, true),
    ('Ejecución presupuestal',  '#10b981', 'FINANCIAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Ingresos', 'Facturación y recibos de pago', '#10b981', 'FINANCIAL', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Ingresos' AND module_code = 'FINANCIAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Facturación',       '#10b981', 'FINANCIAL', pid, 1, true),
    ('Recibos de pago',   '#10b981', 'FINANCIAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Egresos', 'Órdenes de pago y comprobantes', '#10b981', 'FINANCIAL', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Egresos' AND module_code = 'FINANCIAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Órdenes de pago', '#10b981', 'FINANCIAL', pid, 1, true),
    ('Comprobantes',    '#10b981', 'FINANCIAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Contabilidad', 'Estados financieros y libros contables', '#10b981', 'FINANCIAL', NULL, 4, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Contabilidad' AND module_code = 'FINANCIAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Estados financieros', '#10b981', 'FINANCIAL', pid, 1, true),
    ('Libros contables',    '#10b981', 'FINANCIAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: ADMINISTRATIVE
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Gestión General', 'Actas e informes administrativos internos', '#8b5cf6', 'ADMINISTRATIVE', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Gestión General' AND module_code = 'ADMINISTRATIVE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Actas internas',          '#8b5cf6', 'ADMINISTRATIVE', pid, 1, true),
    ('Informes administrativos','#8b5cf6', 'ADMINISTRATIVE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Gestión Documental', 'TRD e inventarios documentales', '#8b5cf6', 'ADMINISTRATIVE', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Gestión Documental' AND module_code = 'ADMINISTRATIVE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Tablas de retención documental', '#8b5cf6', 'ADMINISTRATIVE', pid, 1, true),
    ('Inventarios documentales',       '#8b5cf6', 'ADMINISTRATIVE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Atención', 'PQRS y solicitudes internas', '#8b5cf6', 'ADMINISTRATIVE', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Atención' AND module_code = 'ADMINISTRATIVE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('PQRS',                 '#8b5cf6', 'ADMINISTRATIVE', pid, 1, true),
    ('Solicitudes internas', '#8b5cf6', 'ADMINISTRATIVE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: LEGAL
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Contratación', 'Contratos, otrosíes y terminaciones', '#ef4444', 'LEGAL', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Contratación' AND module_code = 'LEGAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Contratos',     '#ef4444', 'LEGAL', pid, 1, true),
    ('Otrosí',        '#ef4444', 'LEGAL', pid, 2, true),
    ('Terminaciones', '#ef4444', 'LEGAL', pid, 3, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Cumplimiento', 'Políticas y manuales institucionales', '#ef4444', 'LEGAL', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Cumplimiento' AND module_code = 'LEGAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Políticas institucionales', '#ef4444', 'LEGAL', pid, 1, true),
    ('Manuales institucionales',  '#ef4444', 'LEGAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Procesos Jurídicos', 'Demandas y respuestas legales', '#ef4444', 'LEGAL', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Procesos Jurídicos' AND module_code = 'LEGAL' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Demandas',          '#ef4444', 'LEGAL', pid, 1, true),
    ('Respuestas legales','#ef4444', 'LEGAL', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: TECHNOLOGY
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Infraestructura TI', 'Servidores y documentación de red', '#22d3ee', 'TECHNOLOGY', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Infraestructura TI' AND module_code = 'TECHNOLOGY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Configuración de servidores', '#22d3ee', 'TECHNOLOGY', pid, 1, true),
    ('Documentación de red',        '#22d3ee', 'TECHNOLOGY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Sistemas', 'Manuales de software e integraciones', '#22d3ee', 'TECHNOLOGY', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Sistemas' AND module_code = 'TECHNOLOGY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Manuales de software', '#22d3ee', 'TECHNOLOGY', pid, 1, true),
    ('APIs e integraciones', '#22d3ee', 'TECHNOLOGY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Soporte', 'Tickets y reportes de incidencias', '#22d3ee', 'TECHNOLOGY', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Soporte' AND module_code = 'TECHNOLOGY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Tickets',                 '#22d3ee', 'TECHNOLOGY', pid, 1, true),
    ('Reportes de incidencias', '#22d3ee', 'TECHNOLOGY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Seguridad', 'Auditorías y políticas de acceso', '#22d3ee', 'TECHNOLOGY', NULL, 4, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Seguridad' AND module_code = 'TECHNOLOGY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Auditorías de seguridad', '#22d3ee', 'TECHNOLOGY', pid, 1, true),
    ('Políticas de acceso',     '#22d3ee', 'TECHNOLOGY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: COMMUNICATIONS
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Comunicación Interna', 'Circulares y comunicados a docentes', '#06b6d4', 'COMMUNICATIONS', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Comunicación Interna' AND module_code = 'COMMUNICATIONS' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Circulares',              '#06b6d4', 'COMMUNICATIONS', pid, 1, true),
    ('Comunicados a docentes',  '#06b6d4', 'COMMUNICATIONS', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Comunicación Externa', 'Comunicados a padres y boletines', '#06b6d4', 'COMMUNICATIONS', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Comunicación Externa' AND module_code = 'COMMUNICATIONS' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Comunicados a padres', '#06b6d4', 'COMMUNICATIONS', pid, 1, true),
    ('Boletines',            '#06b6d4', 'COMMUNICATIONS', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Marketing', 'Contenido web, redes sociales y campañas', '#06b6d4', 'COMMUNICATIONS', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Marketing' AND module_code = 'COMMUNICATIONS' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Contenido web',  '#06b6d4', 'COMMUNICATIONS', pid, 1, true),
    ('Redes sociales', '#06b6d4', 'COMMUNICATIONS', pid, 2, true),
    ('Campañas',       '#06b6d4', 'COMMUNICATIONS', pid, 3, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: PURCHASING
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Solicitudes', 'Requisiciones de compra', '#f97316', 'PURCHASING', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Solicitudes' AND module_code = 'PURCHASING' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Requisiciones', '#f97316', 'PURCHASING', pid, 1, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Proveedores', 'Base de datos y evaluación de proveedores', '#f97316', 'PURCHASING', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Proveedores' AND module_code = 'PURCHASING' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Base de datos proveedores',   '#f97316', 'PURCHASING', pid, 1, true),
    ('Evaluación de proveedores',   '#f97316', 'PURCHASING', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Contratación de Compras', 'Órdenes de compra y cotizaciones', '#f97316', 'PURCHASING', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Contratación de Compras' AND module_code = 'PURCHASING' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Órdenes de compra', '#f97316', 'PURCHASING', pid, 1, true),
    ('Cotizaciones',      '#f97316', 'PURCHASING', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Seguimiento de Compras', 'Recepción y actas de entrega', '#f97316', 'PURCHASING', NULL, 4, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Seguimiento de Compras' AND module_code = 'PURCHASING' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Recepción de productos', '#f97316', 'PURCHASING', pid, 1, true),
    ('Actas de entrega',       '#f97316', 'PURCHASING', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: INFRASTRUCTURE
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Mantenimiento', 'Reportes y planes de mantenimiento', '#a8a29e', 'INFRASTRUCTURE', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Mantenimiento' AND module_code = 'INFRASTRUCTURE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Reportes de mantenimiento', '#a8a29e', 'INFRASTRUCTURE', pid, 1, true),
    ('Planes preventivos',        '#a8a29e', 'INFRASTRUCTURE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Instalaciones', 'Planos y licencias de construcción', '#a8a29e', 'INFRASTRUCTURE', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Instalaciones' AND module_code = 'INFRASTRUCTURE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Planos',    '#a8a29e', 'INFRASTRUCTURE', pid, 1, true),
    ('Licencias', '#a8a29e', 'INFRASTRUCTURE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Inventario Físico', 'Activos físicos y equipos', '#a8a29e', 'INFRASTRUCTURE', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Inventario Físico' AND module_code = 'INFRASTRUCTURE' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Activos físicos', '#a8a29e', 'INFRASTRUCTURE', pid, 1, true),
    ('Equipos',         '#a8a29e', 'INFRASTRUCTURE', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: HEALTH_SAFETY
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Seguridad Laboral', 'Reportes de accidentes e investigaciones', '#fb7185', 'HEALTH_SAFETY', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Seguridad Laboral' AND module_code = 'HEALTH_SAFETY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Reportes de accidentes', '#fb7185', 'HEALTH_SAFETY', pid, 1, true),
    ('Investigaciones SST',    '#fb7185', 'HEALTH_SAFETY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Salud Ocupacional', 'Exámenes médicos y seguimiento', '#fb7185', 'HEALTH_SAFETY', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Salud Ocupacional' AND module_code = 'HEALTH_SAFETY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Exámenes médicos', '#fb7185', 'HEALTH_SAFETY', pid, 1, true),
    ('Seguimiento SST',  '#fb7185', 'HEALTH_SAFETY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Planes SST', 'Plan de emergencias y simulacros', '#fb7185', 'HEALTH_SAFETY', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Planes SST' AND module_code = 'HEALTH_SAFETY' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Plan de emergencias', '#fb7185', 'HEALTH_SAFETY', pid, 1, true),
    ('Simulacros',          '#fb7185', 'HEALTH_SAFETY', pid, 2, true)
    ON CONFLICT DO NOTHING;

  -- ========================
  -- MÓDULO: BOARD
  -- ========================
  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Sesiones', 'Actas y grabaciones de junta', '#a78bfa', 'BOARD', NULL, 1, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Sesiones' AND module_code = 'BOARD' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Actas de junta', '#a78bfa', 'BOARD', pid, 1, true),
    ('Grabaciones',    '#a78bfa', 'BOARD', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Decisiones', 'Resoluciones y acuerdos de junta', '#a78bfa', 'BOARD', NULL, 2, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Decisiones' AND module_code = 'BOARD' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Resoluciones', '#a78bfa', 'BOARD', pid, 1, true),
    ('Acuerdos',     '#a78bfa', 'BOARD', pid, 2, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO document_categories (name, description, color, module_code, parent_id, sort_order, is_active)
    VALUES ('Seguimiento de Junta', 'Informes de ejecución de decisiones', '#a78bfa', 'BOARD', NULL, 3, true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO pid FROM document_categories WHERE name = 'Seguimiento de Junta' AND module_code = 'BOARD' AND parent_id IS NULL;
  INSERT INTO document_categories (name, color, module_code, parent_id, sort_order, is_active) VALUES
    ('Informes de ejecución', '#a78bfa', 'BOARD', pid, 1, true)
    ON CONFLICT DO NOTHING;

END $$;
