-- ============================================================
-- RxMatch — Admin write access to catalogue_items
-- Migration 004
--
-- catalogue_items has no INSERT/UPDATE/DELETE RLS policies for
-- the authenticated role (admin uses service_role in prod, but
-- in the desktop app we use the anon key + SECURITY DEFINER).
-- ============================================================

-- Insert a single catalogue item
CREATE OR REPLACE FUNCTION admin_insert_catalogue_item(
  p_name     TEXT,
  p_code     TEXT     DEFAULT NULL,
  p_category TEXT     DEFAULT NULL,
  p_synonyms TEXT[]   DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO catalogue_items (name, code, category, synonyms, updated_at)
  VALUES (p_name, p_code, p_category, p_synonyms, NOW())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update a single catalogue item
CREATE OR REPLACE FUNCTION admin_update_catalogue_item(
  p_id       UUID,
  p_name     TEXT,
  p_code     TEXT     DEFAULT NULL,
  p_category TEXT     DEFAULT NULL,
  p_synonyms TEXT[]   DEFAULT '{}'
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE catalogue_items
  SET name = p_name, code = p_code, category = p_category,
      synonyms = p_synonyms, updated_at = NOW()
  WHERE id = p_id;
$$;

-- Delete a single catalogue item
CREATE OR REPLACE FUNCTION admin_delete_catalogue_item(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM catalogue_items WHERE id = p_id;
$$;

-- Bulk insert catalogue items from a JSONB array
-- Each element: { name, code, category, synonyms: [...] }
CREATE OR REPLACE FUNCTION admin_bulk_insert_catalogue_items(p_items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO catalogue_items (name, code, category, synonyms, updated_at)
  SELECT
    item->>'name',
    NULLIF(item->>'code', ''),
    NULLIF(item->>'category', ''),
    ARRAY(SELECT jsonb_array_elements_text(item->'synonyms')),
    NOW()
  FROM jsonb_array_elements(p_items) AS item;
END;
$$;
