-- ============================================================
-- SEMILLA 010 — Panel comercial (docs/FACTURACION.md)
--
-- Los TRES planes del sitio público viven aquí y solo aquí: el
-- precio se cambia en un único lugar. Las cifras siguen pendientes
-- de confirmación del cliente, según se anotó al reconstruir la
-- página pública.
--
-- Impuestos, plazos y datos del emisor son configuración editable
-- (`system_config.billing`), no constantes del código.
--
-- AVISO: el sistema NO emite factura electrónica ante la DIAN.
-- ============================================================

INSERT INTO license_plans
  (code, name, description, billing_period, price_amount, currency, storage_gb, max_users, features, is_active, sort_order)
VALUES
  ('MENSUAL_INSTITUCIONAL',
   'Mensual Institucional',
   'Para una sede que quiere empezar a ordenar su archivo sin comprometerse a un año.',
   'MONTHLY', 1700000.00, 'COP', 500, 25,
   '["500 GB de almacenamiento",
     "Hasta 25 usuarios con acceso simultáneo",
     "Las 11 dependencias y los 8 roles",
     "Búsqueda con inteligencia artificial básica",
     "Foliación, radicación, TRD y expedientes",
     "Soporte de lunes a viernes"]'::jsonb,
   true, 1),

  ('ANUAL_PREMIUM',
   'Anual Premium',
   'El plan pensado para operar el archivo completo de una institución durante todo el año lectivo.',
   'ANNUAL', 10000000.00, 'COP', 1024, NULL,
   '["1 TB de almacenamiento",
     "Usuarios ilimitados",
     "Búsqueda semántica avanzada y asistente por documento",
     "Migración asistida de la información ya digitalizada",
     "Soporte prioritario",
     "Todo lo del plan mensual"]'::jsonb,
   true, 2),

  ('RED_EDUCATIVA',
   'Red Educativa',
   'Para grupos educativos y colegios con varias sedes que necesitan un archivo común y gobierno central. Precio a la medida según sedes y volumen.',
   'CUSTOM', NULL, 'COP', NULL, NULL,
   '["Almacenamiento ampliado según el volumen real",
     "Varias sedes con su propia numeración y permisos",
     "Consolidado institucional de indicadores",
     "Integraciones con los sistemas que ya usa el grupo",
     "Acompañamiento archivístico para elaborar o actualizar la TRD",
     "Todo lo del plan anual"]'::jsonb,
   true, 3)
ON CONFLICT (code) DO NOTHING;

-- Impuesto, plazos y datos del emisor del PDF.
INSERT INTO system_config (key, value, is_secret, description) VALUES
  ('billing',
   '{"currency": "COP",
     "tax_rate": 19,
     "tax_name": "IVA",
     "payment_terms_days": 30,
     "quote_validity_days": 30,
     "issuer": {
       "name": "EduArchive SGDEA",
       "legal_name": "EduArchive SGDEA S.A.S.",
       "document_type": "NIT",
       "document_number": "",
       "address": "Barranquilla, Atlántico",
       "city": "Barranquilla",
       "country": "Colombia",
       "email": "",
       "phone": "",
       "website": "https://eduarchive.com.co/",
       "bank_details": ""
     },
     "quote_terms": "Cotización sujeta a confirmación. Los precios están expresados en pesos colombianos e incluyen el impuesto indicado.",
     "invoice_notes": "Documento de cobro interno del sistema EduArchive SGDEA. No constituye factura electrónica ante la DIAN."}'::jsonb,
   false,
   'Panel comercial: moneda, impuesto, plazos y datos del emisor de cotizaciones y facturas')
ON CONFLICT (key) DO NOTHING;

-- Trabajo diario que marca las facturas vencidas.
UPDATE system_config
   SET value = value || '{"mark_overdue_invoices": "40 0 * * *"}'::jsonb
 WHERE key = 'jobs'
   AND value IS NOT NULL
   AND NOT (value ? 'mark_overdue_invoices');
