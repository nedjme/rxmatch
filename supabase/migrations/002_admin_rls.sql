-- ============================================================
-- RxMatch — Admin catalogue_requests access
-- Migration 002
--
-- The default requests_select policy restricts each user to
-- their own rows. The admin needs to read, update, and approve
-- all rows. SECURITY DEFINER functions bypass RLS safely.
-- ============================================================

-- Function: fetch all requests (admin use only — bypasses RLS)
CREATE OR REPLACE FUNCTION get_all_catalogue_requests(p_status TEXT DEFAULT NULL)
RETURNS SETOF catalogue_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM catalogue_requests
  WHERE (p_status IS NULL OR status = p_status)
  ORDER BY created_at DESC;
$$;

-- Function: reject a request (admin use only — bypasses RLS)
CREATE OR REPLACE FUNCTION admin_update_catalogue_request(
  p_id          UUID,
  p_status      TEXT,
  p_reviewed_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE catalogue_requests
  SET status = p_status, reviewed_at = p_reviewed_at
  WHERE id = p_id;
$$;

-- Function: approve a request — inserts item into catalogue and marks request approved.
-- Bypasses RLS on both tables (catalogue_items has no INSERT policy for authenticated role).
CREATE OR REPLACE FUNCTION admin_approve_catalogue_request(
  p_request_id UUID,
  p_name       TEXT,
  p_code       TEXT        DEFAULT NULL,
  p_category   TEXT        DEFAULT NULL,
  p_synonyms   TEXT[]      DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO catalogue_items (name, code, category, synonyms, updated_at)
  VALUES (p_name, p_code, p_category, p_synonyms, NOW());

  UPDATE catalogue_requests
  SET status = 'approved', reviewed_at = NOW()
  WHERE id = p_request_id;
END;
$$;
