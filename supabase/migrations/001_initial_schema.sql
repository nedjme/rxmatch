-- ============================================================
-- RxMatch — Initial Schema
-- Migration 001
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- Tables
-- ============================================================

-- organizations
CREATE TABLE organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  confidence_threshold FLOAT NOT NULL DEFAULT 0.75,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- organization_members
CREATE TABLE organization_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'pharmacist', 'lab_tech', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- catalogue_items
CREATE TABLE catalogue_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('medicament', 'analyse')),
  code       TEXT,
  synonyms   TEXT[] NOT NULL DEFAULT '{}',
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- catalogue_imports
CREATE TABLE catalogue_imports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  imported_by    UUID NOT NULL REFERENCES auth.users (id),
  filename       TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('add', 'upsert', 'replace')),
  total_rows     INT NOT NULL DEFAULT 0,
  added          INT NOT NULL DEFAULT 0,
  updated        INT NOT NULL DEFAULT 0,
  skipped        INT NOT NULL DEFAULT 0,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- prescriptions
CREATE TABLE prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES auth.users (id),
  image_url       TEXT NOT NULL,
  raw_extraction  JSONB,
  status          TEXT NOT NULL DEFAULT 'en_attente'
                    CHECK (status IN ('en_attente', 'en_cours', 'validee')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- prescription_items
CREATE TABLE prescription_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id        UUID NOT NULL REFERENCES prescriptions (id) ON DELETE CASCADE,
  extracted_name         TEXT NOT NULL,
  extracted_dose         TEXT,
  extracted_frequency    TEXT,
  extraction_confidence  FLOAT,
  suggested_item_id      UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  matched_item_id        UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  match_score            FLOAT,
  was_overridden         BOOLEAN NOT NULL DEFAULT FALSE,
  operator_note          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- decision_history
CREATE TABLE decision_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  extracted_name      TEXT NOT NULL,           -- stored lowercase trimmed
  matched_item_id     UUID NOT NULL REFERENCES catalogue_items (id) ON DELETE CASCADE,
  matched_item_name   TEXT NOT NULL,
  matched_item_code   TEXT,
  matched_item_type   TEXT NOT NULL,
  confirmation_count  INT NOT NULL DEFAULT 1,
  last_confirmed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, extracted_name, matched_item_id)
);

-- audit_events
CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users (id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
                 'prescription', 'prescription_item',
                 'catalogue_item', 'catalogue_import', 'organization', 'member'
               )),
  entity_id   UUID NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- scan_usage
CREATE TABLE scan_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  year       INT NOT NULL,
  month      INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  scan_count INT NOT NULL DEFAULT 0,
  UNIQUE (org_id, year, month)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Immutable wrapper required for use in index expressions
CREATE OR REPLACE FUNCTION synonyms_to_text(synonyms TEXT[])
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT array_to_string(synonyms, ' ');
$$;

-- Trigram indexes for fuzzy search on catalogue_items
CREATE INDEX idx_catalogue_items_name_trgm
  ON catalogue_items USING GIN (name gin_trgm_ops);

CREATE INDEX idx_catalogue_items_synonyms_trgm
  ON catalogue_items USING GIN (synonyms_to_text(synonyms) gin_trgm_ops);

-- Lookup indexes
CREATE INDEX idx_catalogue_items_org_id     ON catalogue_items (org_id);
CREATE INDEX idx_catalogue_items_code       ON catalogue_items (org_id, code);
CREATE INDEX idx_prescriptions_org_id       ON prescriptions (org_id);
CREATE INDEX idx_prescriptions_status       ON prescriptions (org_id, status);
CREATE INDEX idx_prescription_items_pres_id ON prescription_items (prescription_id);
CREATE INDEX idx_decision_history_org_name  ON decision_history (org_id, extracted_name);
CREATE INDEX idx_audit_events_org_id        ON audit_events (org_id, created_at DESC);
CREATE INDEX idx_audit_events_user_id       ON audit_events (user_id);
CREATE INDEX idx_scan_usage_org_period      ON scan_usage (org_id, year DESC, month DESC);
CREATE INDEX idx_org_members_user_id        ON organization_members (user_id);

-- ============================================================
-- Row Level Security — enable on all tables
-- ============================================================

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_usage            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: current user's org membership
-- Used by RLS policies to avoid repeated sub-selects
-- ============================================================

CREATE OR REPLACE FUNCTION auth_user_org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM   organization_members
  WHERE  org_id = p_org_id
    AND  user_id = auth.uid()
  LIMIT  1;
$$;

CREATE OR REPLACE FUNCTION auth_user_is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  org_id  = p_org_id
      AND  user_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS policies — organizations
-- Members can read their own org; admins can update.
-- ============================================================

CREATE POLICY "org_select" ON organizations
  FOR SELECT
  USING (auth_user_is_org_member(id));

CREATE POLICY "org_update" ON organizations
  FOR UPDATE
  USING (auth_user_org_role(id) = 'admin');

-- INSERT is handled server-side (service role) during signup.

-- ============================================================
-- RLS policies — organization_members
-- ============================================================

CREATE POLICY "members_select" ON organization_members
  FOR SELECT
  USING (auth_user_is_org_member(org_id));

-- Only admins can insert / update / delete members.
CREATE POLICY "members_insert" ON organization_members
  FOR INSERT
  WITH CHECK (auth_user_org_role(org_id) = 'admin');

CREATE POLICY "members_update" ON organization_members
  FOR UPDATE
  USING (auth_user_org_role(org_id) = 'admin');

CREATE POLICY "members_delete" ON organization_members
  FOR DELETE
  USING (auth_user_org_role(org_id) = 'admin');

-- ============================================================
-- RLS policies — catalogue_items
-- All members can read; only admins can write.
-- ============================================================

CREATE POLICY "catalogue_select" ON catalogue_items
  FOR SELECT
  USING (auth_user_is_org_member(org_id));

CREATE POLICY "catalogue_insert" ON catalogue_items
  FOR INSERT
  WITH CHECK (auth_user_org_role(org_id) = 'admin');

CREATE POLICY "catalogue_update" ON catalogue_items
  FOR UPDATE
  USING (auth_user_org_role(org_id) = 'admin');

CREATE POLICY "catalogue_delete" ON catalogue_items
  FOR DELETE
  USING (auth_user_org_role(org_id) = 'admin');

-- ============================================================
-- RLS policies — catalogue_imports
-- ============================================================

CREATE POLICY "catalogue_imports_select" ON catalogue_imports
  FOR SELECT
  USING (auth_user_is_org_member(org_id));

CREATE POLICY "catalogue_imports_insert" ON catalogue_imports
  FOR INSERT
  WITH CHECK (auth_user_org_role(org_id) = 'admin');

-- ============================================================
-- RLS policies — prescriptions
-- ============================================================

CREATE POLICY "prescriptions_select" ON prescriptions
  FOR SELECT
  USING (
    auth_user_org_role(org_id) IN ('admin', 'pharmacist', 'lab_tech', 'readonly')
  );

CREATE POLICY "prescriptions_insert" ON prescriptions
  FOR INSERT
  WITH CHECK (
    auth_user_org_role(org_id) IN ('admin', 'pharmacist', 'lab_tech')
  );

CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE
  USING (
    auth_user_org_role(org_id) IN ('admin', 'pharmacist', 'lab_tech')
  );

-- ============================================================
-- RLS policies — prescription_items
-- Joins through prescriptions; mirror the same role set.
-- ============================================================

CREATE POLICY "prescription_items_select" ON prescription_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE  p.id     = prescription_items.prescription_id
        AND  auth_user_org_role(p.org_id) IN (
               'admin', 'pharmacist', 'lab_tech', 'readonly'
             )
    )
  );

CREATE POLICY "prescription_items_insert" ON prescription_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE  p.id     = prescription_items.prescription_id
        AND  auth_user_org_role(p.org_id) IN (
               'admin', 'pharmacist', 'lab_tech'
             )
    )
  );

CREATE POLICY "prescription_items_update" ON prescription_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE  p.id     = prescription_items.prescription_id
        AND  auth_user_org_role(p.org_id) IN (
               'admin', 'pharmacist', 'lab_tech'
             )
    )
  );

-- ============================================================
-- RLS policies — decision_history
-- All members can read; writes go through service role only.
-- ============================================================

CREATE POLICY "decision_history_select" ON decision_history
  FOR SELECT
  USING (auth_user_is_org_member(org_id));

-- ============================================================
-- RLS policies — audit_events
-- All org members can read; only service role can insert
-- (enforced by granting no INSERT to authenticated role).
-- ============================================================

CREATE POLICY "audit_events_select" ON audit_events
  FOR SELECT
  USING (auth_user_is_org_member(org_id));

-- Revoke INSERT from the authenticated role so only service_role
-- (which bypasses RLS) can write audit events.
REVOKE INSERT ON audit_events FROM authenticated;

-- ============================================================
-- RLS policies — scan_usage
-- Only admins can read.
-- ============================================================

CREATE POLICY "scan_usage_select" ON scan_usage
  FOR SELECT
  USING (auth_user_org_role(org_id) = 'admin');
