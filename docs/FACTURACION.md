# EduArchive SGDEA — Panel comercial: clientes, cotizaciones, facturación, pagos y licencias

**Fecha:** 17 de septiembre de 2026
**Objetivo:** un panel donde se vea, por cliente, toda la relación comercial: cotizaciones emitidas, facturas, pagos recibidos y el tipo de licencia contratada con su vigencia.

**Supuesto que debe confirmar el cliente:** este panel administra **los clientes de EduArchive** (las instituciones que contratan el sistema, hoy la Corporación Cultural Colegio Alemán de Barranquilla). Se incluye además una vista de solo lectura para que una institución consulte su propia licencia y sus facturas. Si lo que se buscaba era registrar la facturación *interna del colegio* (proveedores y pagos de la institución), el modelo cambia y hay que rehacerlo.

**Límite explícito:** esto **no** es facturación electrónica ante la DIAN. Registra y numera documentos comerciales, calcula impuestos y genera PDF. Queda un campo `cufe` preparado por si más adelante se integra con un proveedor tecnológico autorizado. No se debe afirmar en ninguna parte que el sistema emite factura electrónica válida.

---

## 1. Modelo de datos

```sql
clients (
  id, name, legal_name, document_type, document_number,   -- NIT / CC
  tax_regime, address, city, state, country DEFAULT 'Colombia',
  contact_name, contact_email, contact_phone,
  status  -- PROSPECT | ACTIVE | SUSPENDED | FORMER
  notes, created_by, created_at, updated_at
)

license_plans (                       -- fuente única de los planes del sitio público
  code PRIMARY KEY,                   -- MENSUAL_INSTITUCIONAL | ANUAL_PREMIUM | RED_EDUCATIVA
  name, description,
  billing_period,                     -- MONTHLY | ANNUAL | CUSTOM
  price_amount NUMERIC(14,2) NULL,    -- NULL = precio a la medida
  currency DEFAULT 'COP',
  storage_gb INT NULL, max_users INT NULL,   -- NULL = ilimitado
  features JSONB, is_active, sort_order
)

licenses (
  id, client_id, plan_code, start_date, end_date,
  status,                             -- ACTIVE | EXPIRED | SUSPENDED | CANCELLED
  seats INT NULL, storage_gb INT NULL,
  price_amount, currency, auto_renew BOOLEAN,
  notes, created_by, created_at, updated_at
)

quotes (
  id, client_id, number UNIQUE,       -- COT-2026-0001
  issue_date, valid_until,
  status,                             -- DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
  currency, subtotal, tax_rate, tax_amount, total,
  notes, terms, created_by, sent_at, decided_at, created_at, updated_at
)
quote_items (id, quote_id, position, description, plan_code NULL, quantity, unit_price, total)

invoices (
  id, client_id, quote_id NULL, license_id NULL, number UNIQUE,   -- FAC-2026-0001
  issue_date, due_date,
  status,                             -- DRAFT | ISSUED | PARTIAL | PAID | OVERDUE | VOID
  currency, subtotal, tax_rate, tax_amount, total,
  paid_amount, balance,               -- calculados
  cufe TEXT NULL, notes, created_by, issued_at, voided_at, void_reason,
  created_at, updated_at
)
invoice_items (id, invoice_id, position, description, plan_code NULL, quantity, unit_price, total)

payments (
  id, invoice_id, client_id, payment_date, amount, currency,
  method,                             -- TRANSFER | PSE | CASH | CHECK | CARD | OTHER
  reference, notes, registered_by, created_at
)

commercial_counters (kind, year, last_value)   -- COT y FAC, igual que los folios
```

**Reglas de consistencia**

1. Los consecutivos se toman con `UPDATE … RETURNING` sobre `commercial_counters`, igual que los folios: sin colisiones bajo concurrencia.
2. `paid_amount` y `balance` de una factura se recalculan en un disparador cada vez que cambian sus pagos. El estado pasa a `PARTIAL`, `PAID` u `OVERDUE` automáticamente; `OVERDUE` lo fija un trabajo diario al pasar `due_date` con saldo.
3. Una factura `PAID` o `VOID` no admite pagos nuevos ni edición de líneas.
4. Anular exige motivo y no borra: cambia a `VOID`, conserva el consecutivo y queda en auditoría.
5. Aceptar una cotización permite convertirla en factura copiando sus líneas y dejando la trazabilidad `invoice.quote_id`.
6. Impuesto por defecto: IVA del 19 % configurable en `system_config.billing` (`tax_rate`, `currency`, `payment_terms_days`, `quote_validity_days`, datos del emisor para el PDF).

---

## 2. Contrato de API

Todas las rutas exigen sesión y la característica correspondiente de `docs/PERMISOS_Y_USUARIOS.md` (`BILLING_VIEW`, `CLIENT_MANAGE`, `QUOTE_MANAGE`, `INVOICE_MANAGE`, `PAYMENT_MANAGE`, `LICENSE_MANAGE`).

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/clients?status=&q=&page=` | `Paginated<Client>` |
| POST/GET/PATCH | `/clients`, `/clients/:id` | alta, detalle y edición |
| GET | `/clients/:id/summary` | `{ client, active_license, licenses[], totals: { invoiced, paid, balance, overdue }, last_quotes[], last_invoices[], last_payments[] }` — es la vista de 360° del cliente |
| GET/POST/PATCH | `/license-plans`, `/license-plans/:code` | catálogo de planes |
| GET/POST/PATCH | `/licenses`, `/licenses/:id` | contratación; `POST /licenses/:id/renew` prorroga según el periodo del plan |
| GET | `/licenses/expiring?days=60` | licencias por vencer |
| GET/POST/PATCH | `/quotes`, `/quotes/:id` | con `items` en el mismo cuerpo |
| POST | `/quotes/:id/status` | `{ status, notes? }` con las transiciones válidas |
| POST | `/quotes/:id/convert` | crea la factura y devuelve `Invoice` |
| GET | `/quotes/:id/pdf` | `{ url }` o descarga directa |
| GET/POST/PATCH | `/invoices`, `/invoices/:id` | |
| POST | `/invoices/:id/issue` · `/void` | emitir (asigna consecutivo y fija `issued_at`) y anular con motivo |
| GET | `/invoices/:id/pdf` | |
| GET/POST/DELETE | `/payments`, `/payments/:id` | registrar y revertir un pago (revertir exige motivo y queda auditado) |
| GET | `/billing/stats?from=&to=` | `{ invoiced_by_month[], collected_by_month[], outstanding, overdue, by_plan[], top_clients[] }` |
| GET | `/billing/my-account` | **Solo lectura para la institución**: su licencia vigente, historial de facturas y pagos. Requiere `BILLING_VIEW`. |

Los PDF se generan en el servidor con la misma librería que ya produce las actas de eliminación, con los datos del emisor tomados de `system_config.billing`.

---

## 3. Panel

Una sección **Comercial** en el panel de administración, visible solo con `BILLING_VIEW`, con cinco pestañas:

1. **Resumen** — facturado y recaudado por mes, cartera pendiente, cartera vencida, ingresos por plan, licencias próximas a vencer y clientes con mayor facturación.
2. **Clientes** — listado con buscador y estado; al abrir uno, su vista de 360°: licencia vigente con vigencia y consumo contratado, cotizaciones, facturas con su saldo y pagos, todo en una línea de tiempo.
3. **Cotizaciones** — creación con líneas, cálculo de impuesto, vigencia, cambio de estado y conversión a factura. Descarga en PDF.
4. **Facturas** — emisión, saldo visible, registro de pagos desde la propia factura, anulación con motivo y descarga en PDF.
5. **Licencias y planes** — planes contratables con precio, almacenamiento y usuarios, y las licencias vigentes por cliente con renovación.

Para la institución cliente se añade una vista simple **Mi cuenta** con su licencia y sus facturas, sin acceso al resto.

---

## 4. Decisiones

1. **Los tres planes del sitio público viven en `license_plans`**, no repetidos en el HTML. Así el precio se cambia en un solo lugar. Las cifras actuales siguen pendientes de confirmación del cliente, según se anotó al reconstruir la página pública.
2. **Nada se borra**: cotizaciones rechazadas, facturas anuladas y pagos revertidos se conservan con su motivo, porque son la memoria comercial y contable.
3. **Sin promesas normativas**: el sistema no emite factura electrónica ante la DIAN ni lo insinúa en ninguna pantalla ni PDF.
4. **Los importes se guardan en `NUMERIC`**, nunca en coma flotante, y se formatean en pesos colombianos con separador de miles.
