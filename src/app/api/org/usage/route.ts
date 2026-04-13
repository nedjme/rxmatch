import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

// ── GET /api/org/usage — last 12 months of scan usage ────────────────────────

export async function GET() {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('scan_usage')
    .select('year, month, scan_count')
    .eq('org_id', orgId)
    .order('year',  { ascending: false })
    .order('month', { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
