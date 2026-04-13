import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';
import type { CommitRequest } from '@/types/extraction';

const ROLES_ALLOWED = ['admin', 'pharmacist', 'lab_tech'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const auth = await requireOrgMember(ROLES_ALLOWED);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  // ── Validate prescription ─────────────────────────────────────────────────

  const { id: prescriptionId } = await params;
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('id, status')
    .eq('id', prescriptionId)
    .eq('org_id', orgId)
    .single();

  if (!prescription) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (prescription.status === 'validee') {
    return NextResponse.json({ error: 'already_committed' }, { status: 409 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────

  let body: CommitRequest;
  try {
    body = (await request.json()) as CommitRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'empty_items' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const ip = getClientIp(request);

  // ── Batch-load prescription items & catalogue items ───────────────────────

  const itemIds       = body.items.map((i) => i.prescription_item_id);
  const catalogueIds  = body.items.map((i) => i.confirmed_item_id);

  const [{ data: presItems }, { data: catItems }] = await Promise.all([
    adminSupabase
      .from('prescription_items')
      .select('id, extracted_name')
      .in('id', itemIds),
    adminSupabase
      .from('catalogue_items')
      .select('id, name, code, type')
      .in('id', catalogueIds),
  ]);

  const presItemMap = new Map(
    (presItems ?? []).map((r) => [r.id, r]),
  );
  const catItemMap = new Map(
    (catItems ?? []).map((r) => [r.id, r]),
  );

  // ── Process each item ─────────────────────────────────────────────────────

  for (const item of body.items) {
    const presItem = presItemMap.get(item.prescription_item_id);
    const catItem  = catItemMap.get(item.confirmed_item_id);

    // 1. Update prescription_item
    await adminSupabase
      .from('prescription_items')
      .update({
        matched_item_id: item.confirmed_item_id,
        was_overridden:  item.was_overridden,
        operator_note:   item.operator_note ?? null,
      })
      .eq('id', item.prescription_item_id);

    // 2. Upsert decision_history (atomic increment via RPC)
    if (presItem && catItem) {
      await adminSupabase.rpc('upsert_decision_history', {
        p_org_id:            orgId,
        p_extracted_name:    presItem.extracted_name,
        p_matched_item_id:   item.confirmed_item_id,
        p_matched_item_name: catItem.name,
        p_matched_item_code: catItem.code ?? null,
        p_matched_item_type: catItem.type,
      });
    }

    // 3. Audit log per item
    await logAuditEvent(
      adminSupabase,
      orgId,
      userId,
      item.was_overridden
        ? 'prescription_item.overridden'
        : 'prescription_item.confirmed',
      'prescription_item',
      item.prescription_item_id,
      {
        confirmed_item_id:   item.confirmed_item_id,
        confirmed_item_name: catItem?.name ?? null,
        operator_note:       item.operator_note ?? null,
      },
      ip,
    );
  }

  // ── Set prescription to 'validee' ─────────────────────────────────────────

  await adminSupabase
    .from('prescriptions')
    .update({ status: 'validee' })
    .eq('id', prescriptionId);

  // ── Audit log — prescription level ───────────────────────────────────────

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'prescription.committed',
    'prescription',
    prescriptionId,
    { item_count: body.items.length },
    ip,
  );

  return NextResponse.json({ ok: true });
}
