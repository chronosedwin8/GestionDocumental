-- ============================================================
-- SEMILLA 004 — Tablas de Retención Documental (TRD)
-- Portadas de las migraciones legadas 09 y 10 (Ley 594/2000,
-- Acuerdo AGN 004/2019). `module` → `module_code`,
-- `disposition` → `disposition_code`.
-- ============================================================

INSERT INTO retention_rules (module_code, document_type, retention_years, disposition_code, description)
VALUES
-- ========================
-- MÓDULO: ACADEMIC (Gestión Académica / Secretaría Académica)
-- ========================
('ACADEMIC', 'Plan de Estudios',                  5,  'SELECCIONAR',
 'Conservar el plan vigente; seleccionar versiones anteriores de interés histórico. Resolución MEN aplicable.'),

('ACADEMIC', 'Reporte de Notas',                  5,  'CONSERVAR',
 'Conservar por 5 años. Soporte para reexpedición de certificados históricos. Decreto 1290/2009.'),

('ACADEMIC', 'Acta de Grado',                    99,  'CONSERVAR',
 'Conservación permanente. Valor probatorio máximo para título académico. Ley 115/1994 Art. 92.'),

('ACADEMIC', 'Expediente del Estudiante',          5,  'CONSERVAR',
 'Conservar durante permanencia del estudiante + 5 años tras egreso. Decreto 1860/1994.'),

('ACADEMIC', 'Certificado de Estudio',             5,  'CONSERVAR',
 'Conservar 5 años. Soporte para reexpedición ante pérdida por el solicitante.'),

('ACADEMIC', 'Informe de Período Académico',       2,  'ELIMINAR',
 'Eliminar tras 2 años. Información reemplazada por el reporte consolidado de notas y boletines finales.'),

('ACADEMIC', 'Proyecto Educativo Institucional',  10,  'SELECCIONAR',
 'Conservar versión vigente; seleccionar versiones anteriores para memoria institucional y rendición de cuentas.'),

-- ========================
-- MÓDULO: HUMAN_RESOURCES (Talento Humano / RRHH)
-- ========================
('HUMAN_RESOURCES', 'Contrato Laboral',           20,  'CONSERVAR',
 'Conservar 20 años desde terminación del vínculo. Valor probatorio laboral y pensional. CST Arts. 53-57.'),

('HUMAN_RESOURCES', 'Historia Laboral',           20,  'CONSERVAR',
 'Conservar durante vigencia del contrato + 10 años. Soporte para liquidaciones y reclamaciones.'),

('HUMAN_RESOURCES', 'Certificado de Trabajo',     10,  'CONSERVAR',
 'Conservar 10 años. Soporte ante reclamaciones laborales post-retiro y requerimientos judiciales.'),

('HUMAN_RESOURCES', 'Evaluación de Desempeño',     5,  'SELECCIONAR',
 'Seleccionar evaluaciones con méritos, faltas o procesos disciplinarios. Eliminar el resto tras 5 años.'),

('HUMAN_RESOURCES', 'Liquidación de Nómina',      10,  'CONSERVAR',
 'Conservar 10 años. Soporte contable y ante UGPP/DIAN. Decreto 1072/2015 Art. 2.2.4.1.6.'),

('HUMAN_RESOURCES', 'Acción de Personal',         20,  'CONSERVAR',
 'Conservar vida laboral + 10 años. Traslados, ascensos, sanciones y memorandos. Decreto 1083/2015.'),

('HUMAN_RESOURCES', 'Solicitud de Vacaciones',     3,  'ELIMINAR',
 'Eliminar tras 3 años siempre que no exista litigio activo relacionado con el período de vacaciones.'),

-- ========================
-- MÓDULO: FINANCIAL (Contabilidad y Finanzas)
-- ========================
('FINANCIAL', 'Presupuesto Anual',                10,  'CONSERVAR',
 'Conservar 10 años. Soporte de planeación financiera institucional. Ley 715/2001 y Decreto 111/1996.'),

('FINANCIAL', 'Comprobante Contable',             10,  'CONSERVAR',
 'Conservar 10 años según normativa tributaria DIAN. Estatuto Tributario Art. 632.'),

('FINANCIAL', 'Factura de Venta / Compra',        10,  'CONSERVAR',
 'Conservar 10 años. Exigido por Estatuto Tributario Art. 632 y normativa DIAN.'),

('FINANCIAL', 'Estado Financiero',                10,  'CONSERVAR',
 'Conservar 10 años. Soporte para auditorías de Contraloría, Revisoría Fiscal y DIAN.'),

('FINANCIAL', 'Nómina Electrónica',               10,  'CONSERVAR',
 'Conservar 10 años. Requerimiento DIAN para nómina electrónica. Resolución DIAN 000013/2021.'),

('FINANCIAL', 'Informe de Auditoría Interna',     10,  'SELECCIONAR',
 'Seleccionar auditorías con hallazgos materiales. Eliminar informes de rutina sin observaciones tras 10 años.'),

('FINANCIAL', 'Acta de Arqueo de Caja',            2,  'ELIMINAR',
 'Eliminar tras 2 años si no hay irregularidades. Conservar permanentemente si hay investigación activa.'),

-- ========================
-- MÓDULO: ADMINISTRATIVE (Secretaría General / Administración)
-- ========================
('ADMINISTRATIVE', 'Acta de Consejo Directivo',  99,  'CONSERVAR',
 'Conservación permanente. Valor histórico-legal máximo. Acto corporativo vinculante. Ley 594/2000 Art. 46.'),

('ADMINISTRATIVE', 'Resolución Rectoral',         99,  'CONSERVAR',
 'Conservación permanente. Acto administrativo con efectos jurídicos sobre la institución.'),

('ADMINISTRATIVE', 'Circular Administrativa',      5,  'SELECCIONAR',
 'Seleccionar circulares con impacto normativo permanente. Eliminar circulares operativas de rutina tras 5 años.'),

('ADMINISTRATIVE', 'Correspondencia Oficial',      5,  'CONSERVAR',
 'Conservar 5 años. Evidencia de comunicación institucional formal con terceros. Acuerdo AGN 060/2001.'),

('ADMINISTRATIVE', 'Manual de Procesos',          10,  'SELECCIONAR',
 'Conservar versión vigente; seleccionar versiones históricas para evidencia de evolución institucional.'),

('ADMINISTRATIVE', 'Informe de Gestión Anual',    10,  'SELECCIONAR',
 'Seleccionar para rendición de cuentas, memoria institucional y auditorías externas.'),

('ADMINISTRATIVE', 'Plan de Mejoramiento',         5,  'SELECCIONAR',
 'Conservar planes con acciones de mejora críticas. Eliminar los cerrados sin hallazgos tras 5 años.'),

-- ========================
-- MÓDULO: LEGAL
-- ========================
('LEGAL', 'Contrato',                  20,  'CONSERVAR',      'Conservación por 20 años desde terminación. Valor probatorio permanente.'),
('LEGAL', 'Otrosí / Adenda',           20,  'CONSERVAR',      'Conservar junto al contrato principal.'),
('LEGAL', 'Acta de Terminación',       10,  'CONSERVAR',      'Conservar por 10 años post-terminación.'),
('LEGAL', 'Política Institucional',    10,  'SELECCIONAR',    'Selección para archivo histórico de políticas vigentes.'),
('LEGAL', 'Manual Institucional',      10,  'SELECCIONAR',    'Selección de versiones vigentes para archivo histórico.'),
('LEGAL', 'Demanda / Proceso Judicial',20,  'CONSERVAR',      'Conservar hasta prescripción de acciones legales + 10 años.'),
('LEGAL', 'Respuesta Legal',           10,  'CONSERVAR',      'Conservar como antecedente legal.'),
('LEGAL', 'Concepto Jurídico',          5,  'SELECCIONAR',    'Selección de conceptos con precedente institucional.'),

-- ========================
-- MÓDULO: TECHNOLOGY
-- ========================
('TECHNOLOGY', 'Manual de Software',       5,  'SELECCIONAR',    'Conservar versión vigente; eliminar obsoletos tras 5 años.'),
('TECHNOLOGY', 'Documentación de Red',    10,  'CONSERVAR',      'Conservar por vida útil del sistema + 5 años.'),
('TECHNOLOGY', 'Configuración de Servidor',5, 'SELECCIONAR',    'Selección de configuraciones con valor histórico.'),
('TECHNOLOGY', 'Ticket de Soporte',        1,  'ELIMINAR',       'Eliminación tras cierre y vencimiento del SLA.'),
('TECHNOLOGY', 'Reporte de Incidencia',    3,  'SELECCIONAR',    'Selección de incidencias críticas para análisis.'),
('TECHNOLOGY', 'Auditoría de Seguridad',  10,  'CONSERVAR',      'Conservar por normativa de seguridad de la información.'),
('TECHNOLOGY', 'Política de Acceso',       5,  'SELECCIONAR',    'Conservar versión vigente; selección de versiones anteriores.'),
('TECHNOLOGY', 'Integración / API',        5,  'SELECCIONAR',    'Selección de documentación de integraciones estratégicas.'),

-- ========================
-- MÓDULO: COMMUNICATIONS
-- ========================
('COMMUNICATIONS', 'Circular Interna',         2,  'ELIMINAR',       'Eliminación post-vigencia de la circular.'),
('COMMUNICATIONS', 'Comunicado a Docentes',    2,  'ELIMINAR',       'Eliminación tras 2 años de emisión.'),
('COMMUNICATIONS', 'Comunicado a Padres',      3,  'ELIMINAR',       'Eliminación tras 3 años; conservar si tiene efectos legales.'),
('COMMUNICATIONS', 'Boletín Institucional',    5,  'SELECCIONAR',    'Selección para archivo histórico institucional.'),
('COMMUNICATIONS', 'Contenido Web',            2,  'ELIMINAR',       'Eliminación tras 2 años de publicación.'),
('COMMUNICATIONS', 'Campaña Publicitaria',     3,  'SELECCIONAR',    'Selección de campañas con valor histórico.'),
('COMMUNICATIONS', 'Comunicado de Prensa',     5,  'CONSERVAR',      'Conservar como registro de imagen institucional.'),

-- ========================
-- MÓDULO: PURCHASING
-- ========================
('PURCHASING', 'Requisición de Compra',     5,  'ELIMINAR',       'Eliminación tras ejecución presupuestal y auditoría.'),
('PURCHASING', 'Cotización',                2,  'ELIMINAR',       'Eliminación tras proceso de selección completado.'),
('PURCHASING', 'Orden de Compra',          10,  'CONSERVAR',      'Conservar por 10 años según normativa fiscal DIAN.'),
('PURCHASING', 'Contrato de Proveedor',    10,  'CONSERVAR',      'Conservar hasta terminación + 10 años.'),
('PURCHASING', 'Evaluación de Proveedor',   5,  'SELECCIONAR',    'Selección de evaluaciones que afecten listas de proveedores.'),
('PURCHASING', 'Acta de Entrega',           5,  'CONSERVAR',      'Conservar junto a la orden de compra correspondiente.'),
('PURCHASING', 'Factura de Proveedor',     10,  'CONSERVAR',      'Conservar por 10 años según normativa tributaria.'),

-- ========================
-- MÓDULO: INFRASTRUCTURE
-- ========================
('INFRASTRUCTURE', 'Plano Arquitectónico',  99,  'CONSERVAR',      'Conservación permanente. Valor probatorio sobre inmuebles.'),
('INFRASTRUCTURE', 'Licencia de Construcción', 99, 'CONSERVAR',   'Conservación permanente. Exigencia legal sobre la propiedad.'),
('INFRASTRUCTURE', 'Reporte de Mantenimiento', 5, 'ELIMINAR',     'Eliminación tras 5 años; conservar si hay garantía activa.'),
('INFRASTRUCTURE', 'Plan Preventivo',          5, 'SELECCIONAR',  'Selección del plan vigente para archivo histórico.'),
('INFRASTRUCTURE', 'Inventario de Activos',   10, 'CONSERVAR',    'Conservar por 10 años como soporte contable de activos.'),
('INFRASTRUCTURE', 'Hoja de Vida de Equipo',  10, 'CONSERVAR',    'Conservar durante vida útil del equipo + 5 años.'),
('INFRASTRUCTURE', 'Cotización de Obra',       2, 'ELIMINAR',     'Eliminación tras ejecución de la obra.'),

-- ========================
-- MÓDULO: HEALTH_SAFETY
-- ========================
('HEALTH_SAFETY', 'Plan de Emergencias',     5,  'CONSERVAR',      'Conservar versión vigente; 5 años para versiones anteriores.'),
('HEALTH_SAFETY', 'Reporte de Accidente',   20,  'CONSERVAR',      'Conservar por vida laboral del afectado + 10 años (Res. 1570/2005).'),
('HEALTH_SAFETY', 'Investigación de Accidente', 20, 'CONSERVAR',  'Conservar por período de prescripción laboral.'),
('HEALTH_SAFETY', 'Examen Médico Ocupacional', 20, 'CONSERVAR',   'Conservar por vida laboral + 10 años (Decreto 1072/2015).'),
('HEALTH_SAFETY', 'Simulacro',               3,  'ELIMINAR',       'Eliminación tras 3 años; conservar si hay hallazgos críticos.'),
('HEALTH_SAFETY', 'Capacitación SST',        5,  'CONSERVAR',      'Conservar como soporte del SGSST ante inspección.'),
('HEALTH_SAFETY', 'Matriz de Riesgos',      10,  'CONSERVAR',      'Conservar versión vigente y anteriores por 10 años.'),
('HEALTH_SAFETY', 'Política SST',            5,  'SELECCIONAR',    'Selección de versiones para archivo histórico del SGSST.'),

-- ========================
-- MÓDULO: BOARD
-- ========================
('BOARD', 'Acta de Junta',              99,  'CONSERVAR',      'Conservación permanente. Valor histórico y legal máximo.'),
('BOARD', 'Resolución de Junta',        99,  'CONSERVAR',      'Conservación permanente. Equivale a norma institucional.'),
('BOARD', 'Acuerdo Institucional',      99,  'CONSERVAR',      'Conservación permanente. Disposiciones de gobierno.'),
('BOARD', 'Grabación de Sesión',        10,  'SELECCIONAR',    'Selección de grabaciones de sesiones estratégicas.'),
('BOARD', 'Informe de Ejecución',       10,  'SELECCIONAR',    'Selección para rendición de cuentas histórica.'),
('BOARD', 'Convocatoria de Junta',       5,  'ELIMINAR',       'Eliminación tras 5 años; conservar si hay impugnaciones.')
ON CONFLICT (module_code, document_type) DO NOTHING;
