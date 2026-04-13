-- ============================================================
-- RxMatch — Seed data (local dev only)
-- Creates one demo organisation.
-- Members are created after user signup via the app.
-- ============================================================

INSERT INTO organizations (id, name, slug, confidence_threshold)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Pharmacie Démo',
  'pharmacie-demo',
  0.75
)
ON CONFLICT (slug) DO NOTHING;
