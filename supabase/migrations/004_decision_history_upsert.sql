-- ============================================================
-- RxMatch — Decision history upsert helper
-- Migration 004
-- ============================================================

-- Atomically inserts or increments a decision_history row.
-- Called by POST /api/prescriptions/[id]/commit for each confirmed item.

CREATE OR REPLACE FUNCTION upsert_decision_history(
  p_org_id            UUID,
  p_extracted_name    TEXT,
  p_matched_item_id   UUID,
  p_matched_item_name TEXT,
  p_matched_item_code TEXT,
  p_matched_item_type TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO decision_history (
    org_id,
    extracted_name,
    matched_item_id,
    matched_item_name,
    matched_item_code,
    matched_item_type,
    confirmation_count,
    last_confirmed_at
  )
  VALUES (
    p_org_id,
    lower(trim(p_extracted_name)),
    p_matched_item_id,
    p_matched_item_name,
    p_matched_item_code,
    p_matched_item_type,
    1,
    now()
  )
  ON CONFLICT (org_id, extracted_name, matched_item_id)
  DO UPDATE SET
    confirmation_count = decision_history.confirmation_count + 1,
    last_confirmed_at  = now(),
    matched_item_name  = EXCLUDED.matched_item_name,
    matched_item_code  = EXCLUDED.matched_item_code,
    matched_item_type  = EXCLUDED.matched_item_type;
$$;
