import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

const PAGE_SIZE = 20;

// ── GET /api/prescriptions — list prescriptions (paginated, filterable) ────────
//
// Query params:
//   status  — 'en_attente' | 'en_cours' | 'validee'
//   page    — 0-based (default 0)

export async function GET(request: NextRequest) {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? '';
  const page   = Math.max(0, Number(searchParams.get('page') ?? 0));

  const adminSupabase = createAdminClient();

  let query = adminSupabase
    .from('prescriptions')
    .select('id, status, created_at, uploaded_by', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (['en_attente', 'en_cours', 'validee'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data: prescriptions, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  // Enrich with uploader name and item count
  const uploaderIds = [...new Set((prescriptions ?? []).map((p) => p.uploaded_by))];
  const uploaderMap = new Map<string, string>();

  await Promise.all(
    uploaderIds.map(async (uid) => {
      const { data } = await adminSupabase.auth.admin.getUserById(uid);
      uploaderMap.set(
        uid,
        (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email ?? uid,
      );
    }),
  );

  // Item counts per prescription
  const presIds = (prescriptions ?? []).map((p) => p.id);
  const { data: itemCounts } = await adminSupabase
    .from('prescription_items')
    .select('prescription_id')
    .in('prescription_id', presIds);

  const countMap = new Map<string, number>();
  for (const row of itemCounts ?? []) {
    countMap.set(row.prescription_id, (countMap.get(row.prescription_id) ?? 0) + 1);
  }

  const enriched = (prescriptions ?? []).map((p) => ({
    id:            p.id,
    status:        p.status,
    created_at:    p.created_at,
    uploader_name: uploaderMap.get(p.uploaded_by) ?? '',
    item_count:    countMap.get(p.id) ?? 0,
  }));

  return NextResponse.json({ prescriptions: enriched, total: count ?? 0 });
}
