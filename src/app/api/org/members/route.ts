import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

// ── GET /api/org/members — list all members with user info ────────────────────

export async function GET() {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const adminSupabase = createAdminClient();

  const { data: members, error } = await adminSupabase
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  // Enrich with email + full_name from auth.users
  const enriched = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: userData } = await adminSupabase.auth.admin.getUserById(m.user_id);
      return {
        id:         m.id,
        user_id:    m.user_id,
        role:       m.role,
        created_at: m.created_at,
        email:      userData?.user?.email     ?? '',
        full_name:  userData?.user?.user_metadata?.full_name ?? null,
      };
    }),
  );

  return NextResponse.json(enriched);
}

// ── POST /api/org/members/invite — create invitation ─────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: { email: string; role: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const role  = body.role;

  if (!email) {
    return NextResponse.json({ error: 'missing_email' }, { status: 400 });
  }
  if (!['admin', 'pharmacist', 'lab_tech', 'readonly'].includes(role)) {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  // Check if user is already a member
  const { data: existingUsers } = await adminSupabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find((u) => u.email === email);
  if (existingUser) {
    const { data: existingMember } = await adminSupabase
      .from('organization_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: 'already_member' }, { status: 409 });
    }
  }

  // Delete any existing pending invitation for this email+org
  await adminSupabase
    .from('invitations')
    .delete()
    .eq('org_id', orgId)
    .eq('email', email)
    .is('accepted_at', null);

  // Insert new invitation
  const { data: invitation, error: invError } = await adminSupabase
    .from('invitations')
    .insert({ org_id: orgId, email, role, invited_by: userId })
    .select('id, token, email, role, expires_at')
    .single();

  if (invError || !invitation) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'member.invited',
    'member',
    invitation.id,
    { email, role },
    getClientIp(request),
  );

  // Return the invite link so admin can share it manually
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/invite/${invitation.token}`;

  return NextResponse.json({ ...invitation, invite_url: inviteUrl }, { status: 201 });
}
