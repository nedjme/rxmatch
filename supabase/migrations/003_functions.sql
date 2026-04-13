-- ============================================================
-- RxMatch — Helper functions & RPCs
-- Migration 003
-- ============================================================

-- ── Fuzzy catalogue search ────────────────────────────────────────────────────
-- Called by matchCatalogueItems() in src/lib/matching.ts
-- and exposed as GET /api/catalogue/search.

CREATE OR REPLACE FUNCTION search_catalogue_items(
  p_org_id UUID,
  p_query  TEXT,
  p_type   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 5
)
RETURNS TABLE (
  id       UUID,
  org_id   UUID,
  name     TEXT,
  type     TEXT,
  code     TEXT,
  synonyms TEXT[],
  metadata JSONB,
  score    FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    org_id,
    name,
    type,
    code,
    synonyms,
    metadata,
    GREATEST(
      similarity(name, p_query),
      similarity(array_to_string(synonyms, ' '), p_query)
    ) AS score
  FROM catalogue_items
  WHERE org_id = p_org_id
    AND (p_type IS NULL OR type = p_type)
    AND GREATEST(
          similarity(name, p_query),
          similarity(array_to_string(synonyms, ' '), p_query)
        ) > 0.1
  ORDER BY score DESC
  LIMIT p_limit;
$$;

-- ── Scan usage counter ────────────────────────────────────────────────────────
-- Atomically increments the monthly scan counter.
-- Called after every successful extraction.

CREATE OR REPLACE FUNCTION increment_scan_usage(
  p_org_id UUID,
  p_year   INTEGER,
  p_month  INTEGER
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO scan_usage (org_id, year, month, scan_count)
  VALUES (p_org_id, p_year, p_month, 1)
  ON CONFLICT (org_id, year, month)
  DO UPDATE SET scan_count = scan_usage.scan_count + 1;
$$;

-- ── Onboarding checklist helper ───────────────────────────────────────────────
-- Returns a row for each onboarding step with a boolean status.
-- Used by the dashboard checklist widget.

CREATE OR REPLACE FUNCTION get_onboarding_status(p_org_id UUID)
RETURNS TABLE (
  catalogue_imported      BOOLEAN,
  first_prescription_done BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    EXISTS(SELECT 1 FROM catalogue_imports WHERE org_id = p_org_id) AS catalogue_imported,
    EXISTS(SELECT 1 FROM prescriptions     WHERE org_id = p_org_id AND status = 'validee') AS first_prescription_done;
$$;
