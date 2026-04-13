import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

// ── GET /api/catalogue/export — download all catalogue items as CSV ───────────

export async function GET() {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.data;

  const adminSupabase = createAdminClient();

  // Fetch all items (no pagination — this is a full export)
  const { data: items, error } = await adminSupabase
    .from('catalogue_items')
    .select('name, type, code, synonyms')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  // Build CSV
  const rows = items ?? [];
  const header = 'name,type,code,synonyms';
  const body   = rows.map((row) => {
    const name     = csvEscape(row.name);
    const type     = csvEscape(row.type);
    const code     = csvEscape(row.code ?? '');
    const synonyms = csvEscape((row.synonyms ?? []).join(', '));
    return `${name},${type},${code},${synonyms}`;
  });

  const csv = [header, ...body].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="catalogue.csv"',
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
