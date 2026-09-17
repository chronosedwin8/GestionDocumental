-- ============================================================
-- SEMILLA 007 — Artículos de ayuda base (editables por el admin)
-- ============================================================

INSERT INTO help_articles (slug, title, body_md, module_code, role_codes, sort_order) VALUES
  ('primeros-pasos', 'Primeros pasos en EduArchive',
   E'# Primeros pasos\n\n1. Cambia tu contraseña temporal desde tu perfil.\n2. Revisa los módulos a los que tienes acceso en el menú lateral.\n3. Sube tu primer documento con el asistente de carga: archivo, clasificación TRD y confirmación.\n4. Consulta la papelera si eliminas algo por error: los documentos se conservan el número de días definido en la configuración.',
   NULL, NULL, 1),

  ('puesta-en-marcha-admin', 'Checklist de puesta en marcha (administrador)',
   E'# Checklist de puesta en marcha\n\n- [ ] Configurar AWS S3 en Administración → Sistema (bucket, región, carpeta base y credenciales).\n- [ ] Probar la conexión de almacenamiento y crear las carpetas base.\n- [ ] Configurar SMTP para el restablecimiento de contraseñas.\n- [ ] Crear los usuarios y asignarles rol y módulos.\n- [ ] Revisar la matriz de acceso rol → módulo.\n- [ ] Revisar y ajustar la TRD por módulo.\n- [ ] Revisar las categorías documentales.\n- [ ] Cargar las personas (empleados y estudiantes).',
   NULL, ARRAY['ADMIN'], 2),

  ('ciclo-documental', 'Ciclo de vida del documento',
   E'# Ciclo documental\n\nRadicación → Clasificación (TRD, serie y subserie) → Foliación → Expediente → Cierre → Transferencia (gestión → central → histórico) → Disposición final (conservar, seleccionar o eliminar con acta).\n\nCada transición queda registrada en la cadena de custodia del documento.',
   NULL, NULL, 3),

  ('foliacion', 'Foliación y radicación',
   E'# Foliación y radicación\n\nEl folio tiene el formato `PREFIJO-AÑO-0000` y el prefijo proviene del módulo. Se asigna automáticamente al subir el documento si la opción `auto_folio` está activa; también puede asignarse manualmente.\n\nEl radicado de expedientes usa el prefijo de radicado del módulo y un consecutivo anual independiente por tipo de correspondencia.',
   NULL, NULL, 4),

  ('busqueda', 'Cómo buscar documentos',
   E'# Búsqueda\n\n- **Full-text**: busca en título, folio, resumen, etiquetas, metadatos y en el texto extraído del archivo.\n- **Avanzada**: combina autor, fechas, módulo, etiqueta, estado, tipo y folio.\n- **Semántica**: describe lo que necesitas en lenguaje natural; requiere que la IA esté configurada.',
   NULL, NULL, 5),

  ('prestamos', 'Préstamos de documentos',
   E'# Préstamos\n\nUn préstamo otorga lectura del documento al usuario destinatario mientras esté activo, aunque no tenga acceso al módulo. Al vencer la fecha esperada de devolución el préstamo pasa a estado vencido y se notifica al responsable.',
   NULL, NULL, 6)
ON CONFLICT (slug) DO NOTHING;
