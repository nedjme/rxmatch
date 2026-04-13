import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

const PAGE_SIZE = 50;

// ── GET /api/org/journal — paginated audit log (admin only) ───────────────────
//
// Query params:
//   action  — filter by action string (exact match)
//   user_id — filter by user_id
//   page    — 0-based page number (default 0)

export async function GET(request: NextRequest) {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const { searchParams } = new URL(request.url);
  const action  = searchParams.get('action')  ?? '';
  const userId  = searchParams.get('user_id') ?? '';
  const page    = Math.max(0, Number(searchParams.get('page') ?? 0));

  const adminSupabase = createAdminClient();

  let query = adminSupabase
    .from('audit_events')
    .select('id, action, entity_type, entity_id, payload, ip_address, created_at, user_id', {
      count: 'exact',
    })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (action)  query = query.eq('action',  action);
  if (userId)  query = query.eq('user_id', userId);

  const { data: events, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  // Enrich each event with the actor's email + name
  const userIds    = [...new Set((events ?? []).map((e) => e.user_id))];
  const userMap    = new Map<string, { email: string; full_name: string | null }>();

  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await adminSupabase.auth.admin.getUserById(uid);
      userMap.set(uid, {
        email:     data?.user?.email             ?? uid,
        full_name: data?.user?.user_metadata?.full_name ?? null,
      });
    }),
  );

  const enriched = (events ?? []).map((e) => ({
    ...e,
    actor: userMap.get(e.user_id) ?? { email: e.user_id, full_name: null },
  }));

  // Also return the distinct list of users in this org for the filter dropdown
  const { data: members } = await adminSupabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId);

  const memberUsers = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data } = await adminSupabase.auth.admin.getUserById(m.user_id);
      return {
        user_id:   m.user_id,
        email:     data?.user?.email             ?? m.user_id,
        full_name: data?.user?.user_metadata?.full_name ?? null,
      };
    }),
  );

  return NextResponse.json({
    events:  enriched,
    total:   count ?? 0,
    page,
    members: memberUsers,
  });
}
