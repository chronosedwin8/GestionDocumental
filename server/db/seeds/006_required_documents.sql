-- ============================================================
-- SEMILLA 006 — Checklist de documentos obligatorios por tipo de persona
-- Editable desde /api/people/required-documents
-- ============================================================

INSERT INTO required_documents (person_type_code, document_type, is_mandatory, sort_order) VALUES
  ('EMPLOYEE', 'Contrato Laboral',            true,  1),
  ('EMPLOYEE', 'Historia Laboral',            true,  2),
  ('EMPLOYEE', 'Examen Médico Ocupacional',   true,  3),
  ('EMPLOYEE', 'Certificado de Trabajo',      false, 4),
  ('EMPLOYEE', 'Evaluación de Desempeño',     false, 5),

  ('STUDENT',  'Expediente del Estudiante',   true,  1),
  ('STUDENT',  'Reporte de Notas',            true,  2),
  ('STUDENT',  'Certificado de Estudio',      false, 3),
  ('STUDENT',  'Acta de Grado',               false, 4)
ON CONFLICT (person_type_code, document_type) DO NOTHING;
