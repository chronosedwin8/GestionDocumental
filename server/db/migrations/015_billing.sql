-- ============================================================
-- 015 — Panel comercial: clientes, planes, licencias,
--       cotizaciones, facturas y pagos (docs/FACTURACION.md)
--
-- LÍMITE EXPLÍCITO: esto NO es facturación electrónica ante la
-- DIAN. Numera y registra documentos comerciales, calcula
-- impuestos y genera PDF. `invoices.cufe` queda preparado y
-- VACÍO por si más adelante se integra un proveedor autorizado.
--
-- Todos los importes son NUMERIC(14,2): nunca coma flotante.
-- El redondeo es explícito, a 2 decimales, en cada paso
-- (línea → subtotal → impuesto → total).
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  legal_name      TEXT,
  document_type   TEXT NOT NULL DEFAULT 'NIT',
  document_number TEXT,
  tax_regime      TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  country         TEXT NOT NULL DEFAULT 'Colombia',
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  status          TEXT NOT NULL DEFAULT 'PROSPECT'
                  CHECK (status IN ('PROSPECT','ACTIVE','SUSPENDED','FORMER')),
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);
CREATE UNIQUE INDEX IF NOT EXISTS clients_document_key
  ON clients (document_type, document_number) WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS license_plans (
  code           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  billing_period TEXT NOT NULL DEFAULT 'MONTHLY'
                 CHECK (billing_period IN ('MONTHLY','ANNUAL','CUSTOM')),
  price_amount   NUMERIC(14,2),
  currency       TEXT NOT NULL DEFAULT 'COP',
  storage_gb     INT,
  max_users      INT,
  features       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_code    TEXT NOT NULL REFERENCES license_plans(code) ON UPDATE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED','CANCELLED')),
  seats        INT,
  storage_gb   INT,
  price_amount NUMERIC(14,2),
  currency     TEXT NOT NULL DEFAULT 'COP',
  auto_renew   BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_licenses_client ON licenses (client_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_end ON licenses (end_date) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  number      TEXT NOT NULL UNIQUE,
  issue_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  valid_until DATE,
  status      TEXT NOT NULL DEFAULT 'DRAFT'
              CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
  currency    TEXT NOT NULL DEFAULT 'COP',
  subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  terms       TEXT,
  decision_reason TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at     TIMESTAMPTZ,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (status);

CREATE TABLE IF NOT EXISTS quote_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  plan_code   TEXT REFERENCES license_plans(code) ON UPDATE CASCADE,
  quantity    NUMERIC(14,2) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items (quote_id, position);

CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  quote_id    UUID REFERENCES quotes(id) ON DELETE SET NULL,
  license_id  UUID REFERENCES licenses(id) ON DELETE SET NULL,
  number      TEXT UNIQUE,
  issue_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'DRAFT'
              CHECK (status IN ('DRAFT','ISSUED','PARTIAL','PAID','OVERDUE','VOID')),
  currency    TEXT NOT NULL DEFAULT 'COP',
  subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance     NUMERIC(14,2) NOT NULL DEFAULT 0,
  cufe        TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at   TIMESTAMPTZ,
  voided_at   TIMESTAMPTZ,
  void_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices (due_date) WHERE status IN ('ISSUED','PARTIAL');

CREATE TABLE IF NOT EXISTS invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  plan_code   TEXT REFERENCES license_plans(code) ON UPDATE CASCADE,
  quantity    NUMERIC(14,2) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id, position);

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency      TEXT NOT NULL DEFAULT 'COP',
  method        TEXT NOT NULL DEFAULT 'TRANSFER'
                CHECK (method IN ('TRANSFER','PSE','CASH','CHECK','CARD','OTHER')),
  reference     TEXT,
  notes         TEXT,
  reversed_at     TIMESTAMPTZ,
  reversed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments (client_id, payment_date DESC);

-- Consecutivos comerciales por año, igual que los folios.
CREATE TABLE IF NOT EXISTS commercial_counters (
  kind       TEXT NOT NULL,
  year       INT  NOT NULL,
  last_value INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);

-- ------------------------------------------------------------
-- Consecutivos: UPDATE … RETURNING (sin COUNT(*), sin colisiones)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_commercial_value(p_kind TEXT, p_year INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_value INT;
  v_try   INT := 0;
BEGIN
  LOOP
    UPDATE commercial_counters
       SET last_value = last_value + 1
     WHERE kind = p_kind AND year = p_year
    RETURNING last_value INTO v_value;

    IF v_value IS NOT NULL THEN
      RETURN v_value;
    END IF;

    v_try := v_try + 1;
    IF v_try > 3 THEN
      RAISE EXCEPTION 'No fue posible obtener el consecutivo comercial % %', p_kind, p_year;
    END IF;

    INSERT INTO commercial_counters (kind, year, last_value)
    VALUES (p_kind, p_year, 0)
    ON CONFLICT (kind, year) DO NOTHING;
  END LOOP;
END;
$$;

-- Devuelve COT-2026-0001 / FAC-2026-0001
CREATE OR REPLACE FUNCTION next_commercial_number(p_kind TEXT, p_year INT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year INT := coalesce(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::INT);
  v_seq  INT;
BEGIN
  v_seq := next_commercial_value(p_kind, v_year);
  RETURN p_kind || '-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

-- ------------------------------------------------------------
-- Totales de una factura: los pagos mandan sobre paid_amount,
-- balance y estado. Se recalcula en cada cambio de `payments`.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_invoice_balance(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_balance NUMERIC(14,2);
  v_status  TEXT;
  v_due     DATE;
  v_new     TEXT;
BEGIN
  SELECT total, status, due_date INTO v_total, v_status, v_due
    FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_total IS NULL THEN RETURN; END IF;

  SELECT round(coalesce(sum(amount), 0), 2) INTO v_paid
    FROM payments WHERE invoice_id = p_invoice_id AND reversed_at IS NULL;

  v_balance := round(v_total - v_paid, 2);

  -- Una factura ANULADA o en BORRADOR no cambia de estado por los pagos.
  IF v_status IN ('VOID', 'DRAFT') THEN
    v_new := v_status;
  ELSIF v_paid >= v_total AND v_total > 0 THEN
    v_new := 'PAID';
  ELSIF v_paid > 0 THEN
    v_new := 'PARTIAL';
  ELSIF v_due IS NOT NULL AND v_due < (now() AT TIME ZONE 'UTC')::date THEN
    v_new := 'OVERDUE';
  ELSE
    v_new := 'ISSUED';
  END IF;

  UPDATE invoices
     SET paid_amount = v_paid, balance = v_balance, status = v_new, updated_at = now()
   WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION payments_recalc_invoice()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recalc_invoice_balance(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_recalc ON payments;
CREATE TRIGGER trg_payments_recalc AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_recalc_invoice();

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_license_plans_updated ON license_plans;
CREATE TRIGGER trg_license_plans_updated BEFORE UPDATE ON license_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_licenses_updated ON licenses;
CREATE TRIGGER trg_licenses_updated BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quotes_updated ON quotes;
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
