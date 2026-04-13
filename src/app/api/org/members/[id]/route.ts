import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

// ── PATCH /api/org/members/[id] — change role ─────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: { role: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!['admin', 'pharmacist', 'lab_tech', 'readonly'].includes(body.role)) {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: member, error } = await adminSupabase
    .from('organization_members')
    .update({ role: body.role })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, user_id, role')
    .single();

  if (error || !member) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'member.role_changed',
    'member',
    member.id,
    { user_id: member.user_id, new_role: body.role },
    getClientIp(request),
  );

  return NextResponse.json(member);
}

// ── DELETE /api/org/members/[id] — remove member ─────────────────────────────

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  const adminSupabase = createAdminClient();

  // Fetch member first to prevent self-removal and for audit
  const { data: member } = await adminSupabase
    .from('organization_members')
    .select('id, user_id, role')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Prevent admin from removing themselves
  if (member.user_id === userId) {
    return NextResponse.json({ error: 'cannot_remove_self' }, { status: 400 });
  }

  const { error } = await adminSupabase
    .from('organization_members')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'member.removed',
    'member',
    member.id,
    { user_id: member.user_id, role: member.role },
    getClientIp(request),
  );

  return NextResponse.json({ ok: true });
}
