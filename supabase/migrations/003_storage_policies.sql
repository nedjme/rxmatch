-- ============================================================
-- RxMatch — Storage bucket + RLS policies
-- Migration 003
--
-- Creates the 'prescriptions' bucket (if not already created
-- via the dashboard) and adds RLS policies so each user can
-- only upload/read/delete files under their own user_id prefix.
-- ============================================================

-- Create the bucket (no-op if it already exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload into their own folder
CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to read their own files
CREATE POLICY "storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own files
CREATE POLICY "storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
