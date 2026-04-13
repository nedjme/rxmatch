-- ============================================================
-- RxMatch — Invitations table
-- Migration 002
-- ============================================================

CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'pharmacist', 'lab_tech', 'readonly')),
  token       TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by  UUID NOT NULL REFERENCES auth.users (id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token  ON invitations (token);
CREATE INDEX idx_invitations_org_id ON invitations (org_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view all invitations for their org
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT
  USING (auth_user_org_role(org_id) = 'admin');

-- Admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT
  WITH CHECK (auth_user_org_role(org_id) = 'admin');

-- Admins can cancel (delete) pending invitations
CREATE POLICY "invitations_delete" ON invitations
  FOR DELETE
  USING (auth_user_org_role(org_id) = 'admin');

-- The accept flow updates accepted_at via service role only —
-- no UPDATE policy for authenticated users.
