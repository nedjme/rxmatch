-- ============================================================
-- RxMatch — Fresh Schema (Lab-only, no organizations)
-- Migration 001
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- profiles
-- One row per auth user. MAC address is bound on first login
-- and cannot be changed afterwards.
-- ============================================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name   TEXT,
  mac_address TEXT UNIQUE,           -- bound on first login, immutable after
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- phone_devices table intentionally removed.
-- Phones connect over LAN only — no pre-registration needed.
-- The LAN itself is the security boundary; MAC randomization on
-- modern iOS/Android makes per-device binding unreliable.

-- ============================================================
-- user_settings
-- Per-user application preferences.
-- ============================================================

CREATE TABLE user_settings (
  user_id           UUID PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  local_save_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  local_save_folder   TEXT,           -- absolute path on disk, null = not set
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- catalogue_items
-- Global catalogue shared across all users. Only the admin
-- account (env-configured) may insert/update/delete directly.
-- ============================================================

CREATE TABLE catalogue_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT,
  synonyms   TEXT[] NOT NULL DEFAULT '{}',
  category   TEXT,                       -- e.g. "hématologie", "biochimie"
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- catalogue_requests
-- Users submit requests to add items; admin approves/rejects.
-- ============================================================

CREATE TABLE catalogue_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  synonyms    TEXT[] NOT NULL DEFAULT '{}',
  category    TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- prescriptions
-- Each prescription belongs to one user. image_url stores the
-- path of the MASKED image in Supabase Storage (used for UI
-- preview). The unmasked original stays on-device only.
-- ============================================================

CREATE TABLE prescriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  image_url      TEXT NOT NULL,      -- masked image path in Supabase Storage
  raw_extraction JSONB,
  status         TEXT NOT NULL DEFAULT 'en_attente'
                   CHECK (status IN ('en_attente', 'en_cours', 'validee')),
  masked         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- prescription_items
-- Individual lab tests extracted from a prescription.
-- ============================================================

CREATE TABLE prescription_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id       UUID NOT NULL REFERENCES prescriptions (id) ON DELETE CASCADE,
  extracted_name        TEXT NOT NULL,
  extraction_confidence FLOAT,
  suggested_item_id     UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  matched_item_id       UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  match_score           FLOAT,
  was_overridden        BOOLEAN NOT NULL DEFAULT FALSE,
  operator_note         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- decision_history
-- Tracks human-confirmed name → catalogue item mappings.
-- Used to boost match confidence on subsequent extractions.
-- Global (not user-scoped) so the model improves for everyone.
-- ============================================================

CREATE TABLE decision_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_name     TEXT NOT NULL,      -- stored lowercase trimmed
  matched_item_id    UUID NOT NULL REFERENCES catalogue_items (id) ON DELETE CASCADE,
  matched_item_name  TEXT NOT NULL,
  matched_item_code  TEXT,
  confirmation_count INT NOT NULL DEFAULT 1,
  last_confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (extracted_name, matched_item_id)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Immutable helper for trigram index on synonyms array
CREATE OR REPLACE FUNCTION synonyms_to_text(synonyms TEXT[])
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT array_to_string(synonyms, ' ');
$$;

-- Trigram indexes for fuzzy catalogue search
CREATE INDEX idx_catalogue_name_trgm
  ON catalogue_items USING GIN (name gin_trgm_ops);

CREATE INDEX idx_catalogue_synonyms_trgm
  ON catalogue_items USING GIN (synonyms_to_text(synonyms) gin_trgm_ops);

CREATE INDEX idx_catalogue_code           ON catalogue_items (code);
CREATE INDEX idx_catalogue_category       ON catalogue_items (category);

CREATE INDEX idx_prescriptions_user       ON prescriptions (user_id, created_at DESC);
CREATE INDEX idx_prescriptions_status     ON prescriptions (status);
CREATE INDEX idx_prescription_items_pres  ON prescription_items (prescription_id);
CREATE INDEX idx_decision_history_name    ON decision_history (extracted_name);
CREATE INDEX idx_catalogue_requests_user  ON catalogue_requests (user_id, created_at DESC);
CREATE INDEX idx_catalogue_requests_status ON catalogue_requests (status);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_devices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_history   ENABLE ROW LEVEL SECURITY;

-- profiles: users see and edit only their own row
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- phone_devices: user owns their own device row
CREATE POLICY "phone_select" ON phone_devices FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "phone_insert" ON phone_devices FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "phone_update" ON phone_devices FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "phone_delete" ON phone_devices FOR DELETE USING (user_id = auth.uid());

-- user_settings: own row only
CREATE POLICY "settings_select" ON user_settings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "settings_insert" ON user_settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "settings_update" ON user_settings FOR UPDATE USING (user_id = auth.uid());

-- catalogue_items: all authenticated users can read; writes via service role only
CREATE POLICY "catalogue_select" ON catalogue_items FOR SELECT TO authenticated USING (TRUE);
-- No INSERT/UPDATE/DELETE policies for authenticated role — admin uses service_role

-- catalogue_requests: user sees own requests; writes own requests
CREATE POLICY "requests_select" ON catalogue_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "requests_insert" ON catalogue_requests FOR INSERT WITH CHECK (user_id = auth.uid());

-- prescriptions: user sees own prescriptions
CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "prescriptions_update" ON prescriptions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "prescriptions_delete" ON prescriptions FOR DELETE USING (user_id = auth.uid());

-- prescription_items: via owning prescription
CREATE POLICY "items_select" ON prescription_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM prescriptions p
    WHERE p.id = prescription_items.prescription_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "items_insert" ON prescription_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM prescriptions p
    WHERE p.id = prescription_items.prescription_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "items_update" ON prescription_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM prescriptions p
    WHERE p.id = prescription_items.prescription_id AND p.user_id = auth.uid()
  ));

-- decision_history: all authenticated users can read; writes via service role
CREATE POLICY "history_select" ON decision_history FOR SELECT TO authenticated USING (TRUE);
REVOKE INSERT, UPDATE, DELETE ON decision_history FROM authenticated;

-- ============================================================
-- Functions
-- ============================================================

-- Fuzzy catalogue search used by the matching engine
CREATE OR REPLACE FUNCTION search_catalogue_items(
  p_query     TEXT,
  p_limit     INT     DEFAULT 8,
  p_threshold FLOAT   DEFAULT 0.25,
  p_category  TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id       UUID,
  name     TEXT,
  code     TEXT,
  synonyms TEXT[],
  category TEXT,
  score    FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ci.id,
    ci.name,
    ci.code,
    ci.synonyms,
    ci.category,
    GREATEST(
      similarity(ci.name, p_query),
      similarity(synonyms_to_text(ci.synonyms), p_query)
    ) AS score
  FROM catalogue_items ci
  WHERE
    (p_category IS NULL OR ci.category = p_category)
    AND GREATEST(
      similarity(ci.name, p_query),
      similarity(synonyms_to_text(ci.synonyms), p_query)
    ) >= p_threshold
  ORDER BY score DESC
  LIMIT p_limit;
$$;

-- Upsert a decision_history row (increment confirmation_count on conflict)
CREATE OR REPLACE FUNCTION upsert_decision_history(
  p_extracted_name    TEXT,
  p_matched_item_id   UUID,
  p_matched_item_name TEXT,
  p_matched_item_code TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO decision_history
    (extracted_name, matched_item_id, matched_item_name, matched_item_code, confirmation_count, last_confirmed_at)
  VALUES
    (lower(trim(p_extracted_name)), p_matched_item_id, p_matched_item_name, p_matched_item_code, 1, NOW())
  ON CONFLICT (extracted_name, matched_item_id) DO UPDATE
    SET confirmation_count = decision_history.confirmation_count + 1,
        last_confirmed_at  = NOW();
$$;

-- ============================================================
-- Storage bucket (run via Supabase dashboard or CLI)
-- ============================================================
-- Create a private bucket named 'prescriptions' manually in the
-- Supabase dashboard, or via: supabase storage buckets create prescriptions
-- RLS policies on storage.objects should restrict to owner (user_id in path).
