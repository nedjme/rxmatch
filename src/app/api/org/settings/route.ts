import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

// ── GET /api/org/settings — fetch org settings ────────────────────────────────

export async function GET() {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const adminSupabase = createAdminClient();

  const { data: org, error } = await adminSupabase
    .from('organizations')
    .select('id, name, slug, confidence_threshold, created_at')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(org);
}

// ── PATCH /api/org/settings — update name / confidence_threshold ──────────────

export async function PATCH(request: NextRequest) {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: { name?: string; confidence_threshold?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    update.name = body.name.trim();
  }

  if (body.confidence_threshold !== undefined) {
    const t = Number(body.confidence_threshold);
    if (isNaN(t) || t < 0 || t > 1) {
      return NextResponse.json({ error: 'invalid_threshold' }, { status: 400 });
    }
    update.confidence_threshold = t;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: org, error } = await adminSupabase
    .from('organizations')
    .update(update)
    .eq('id', orgId)
    .select('id, name, slug, confidence_threshold')
    .single();

  if (error || !org) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'org.settings_updated',
    'organization',
    orgId,
    { changes: update },
    getClientIp(request),
  );

  return NextResponse.json(org);
}
