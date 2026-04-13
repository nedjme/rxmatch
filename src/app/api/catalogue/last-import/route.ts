import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

// ── GET /api/catalogue/last-import — fetch most recent import record ──────────

export async function GET() {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const adminSupabase = createAdminClient();

  const { data } = await adminSupabase
    .from('catalogue_imports')
    .select('id, filename, mode, added, updated, skipped, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}
