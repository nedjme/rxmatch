import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

const ROLES_ALLOWED = ['admin', 'pharmacist', 'lab_tech'];

type Params = { params: Promise<{ id: string }> };

// ── DELETE /api/prescriptions/[id] ───────────────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireOrgMember(ROLES_ALLOWED);
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const { id } = await params;
  const adminSupabase = createAdminClient();

  // Verify ownership before deleting
  const { data: prescription } = await adminSupabase
    .from('prescriptions')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (!prescription) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Cascade deletes prescription_items via FK ON DELETE CASCADE
  const { error } = await adminSupabase
    .from('prescriptions')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── PATCH /api/prescriptions/[id] — reopen for revision ─────────────────────

export async function PATCH(_request: NextRequest, { params }: Params) {
  const auth = await requireOrgMember(ROLES_ALLOWED);
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const { id } = await params;
  const adminSupabase = createAdminClient();

  const { data: prescription } = await adminSupabase
    .from('prescriptions')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (!prescription) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Reset status and clear all item confirmations
  await Promise.all([
    adminSupabase
      .from('prescriptions')
      .update({ status: 'en_cours' })
      .eq('id', id),
    adminSupabase
      .from('prescription_items')
      .update({ matched_item_id: null, was_overridden: false, operator_note: null })
      .eq('prescription_id', id),
  ]);

  return NextResponse.json({ ok: true });
}
