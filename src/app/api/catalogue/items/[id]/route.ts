import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

// ── PATCH /api/catalogue/items/[id] — update a catalogue item ────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: {
    name?:     string;
    type?:     string;
    code?:     string | null;
    synonyms?: string[];
    metadata?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (body.type && !['medicament', 'analyse'].includes(body.type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  // Build update object — only include fields that were provided
  const update: Record<string, unknown> = {};
  if (body.name     !== undefined) update.name     = body.name.trim();
  if (body.type     !== undefined) update.type     = body.type;
  if (body.code     !== undefined) update.code     = body.code?.trim() || null;
  if (body.synonyms !== undefined) update.synonyms = body.synonyms;
  if (body.metadata !== undefined) update.metadata = body.metadata;

  const { data: item, error } = await adminSupabase
    .from('catalogue_items')
    .update(update)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error || !item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'catalogue_item.updated',
    'catalogue_item',
    item.id,
    { name: item.name, changes: update },
    getClientIp(request),
  );

  return NextResponse.json(item);
}

// ── DELETE /api/catalogue/items/[id] — delete a catalogue item ───────────────

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  const adminSupabase = createAdminClient();

  // Fetch item first so we can include its name in the audit log
  const { data: item } = await adminSupabase
    .from('catalogue_items')
    .select('id, name, type, code')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { error } = await adminSupabase
    .from('catalogue_items')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'catalogue_item.deleted',
    'catalogue_item',
    item.id,
    { name: item.name, type: item.type, code: item.code },
    getClientIp(request),
  );

  return NextResponse.json({ ok: true });
}
