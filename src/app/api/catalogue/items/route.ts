import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

// ── GET /api/catalogue/items — list items (paginated, optional search + type) ─

export async function GET(request: NextRequest) {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const { searchParams } = new URL(request.url);
  const q     = searchParams.get('q')?.trim()     ?? '';
  const type  = searchParams.get('type')          ?? '';
  const page  = Math.max(0, Number(searchParams.get('page')  ?? 0));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));

  const adminSupabase = createAdminClient();

  let countQuery = adminSupabase
    .from('catalogue_items')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  let itemsQuery = adminSupabase
    .from('catalogue_items')
    .select('id, name, type, code, synonyms, metadata, created_at')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
    .range(page * limit, page * limit + limit - 1);

  if (type === 'medicament' || type === 'analyse') {
    countQuery = countQuery.eq('type', type);
    itemsQuery = itemsQuery.eq('type', type);
  }

  if (q) {
    countQuery = countQuery.ilike('name', `%${q}%`);
    itemsQuery = itemsQuery.ilike('name', `%${q}%`);
  }

  const [{ count }, { data: items }] = await Promise.all([countQuery, itemsQuery]);

  return NextResponse.json({ items: items ?? [], total: count ?? 0 });
}

// ── POST /api/catalogue/items — create a single catalogue item ───────────────

export async function POST(request: NextRequest) {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: {
    name:      string;
    type:      string;
    code?:     string;
    synonyms?: string[];
    metadata?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.name?.trim() || !body.type) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  if (!['medicament', 'analyse'].includes(body.type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: item, error } = await adminSupabase
    .from('catalogue_items')
    .insert({
      org_id:   orgId,
      name:     body.name.trim(),
      type:     body.type,
      code:     body.code?.trim() || null,
      synonyms: body.synonyms ?? [],
      metadata: body.metadata ?? {},
    })
    .select('*')
    .single();

  if (error || !item) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'catalogue_item.created',
    'catalogue_item',
    item.id,
    { name: item.name, type: item.type, code: item.code },
    getClientIp(request),
  );

  return NextResponse.json(item, { status: 201 });
}
