import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';

interface ImportRow {
  name:      string;
  type?:     string;
  code?:     string;
  synonyms?: string; // comma-separated raw string from CSV cell
  metadata?: Record<string, unknown>;
}

interface ImportBody {
  rows:           ImportRow[];
  mode:           'add' | 'upsert' | 'replace';
  column_mapping: Record<string, string>;
  default_type?:  'medicament' | 'analyse';
}

// ── POST /api/catalogue/import ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireOrgMember(['admin']);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { rows, mode, column_mapping } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'empty_rows' }, { status: 400 });
  }
  if (!['add', 'upsert', 'replace'].includes(mode)) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  let added   = 0;
  let updated = 0;
  let skipped = 0;

  // ── Replace mode: delete all existing items first ─────────────────────────
  if (mode === 'replace') {
    await adminSupabase.from('catalogue_items').delete().eq('org_id', orgId);
  }

  // ── Fetch existing codes for add/upsert modes ─────────────────────────────
  let existingCodes = new Set<string>();
  let existingNames = new Set<string>();
  if (mode !== 'replace') {
    const { data: existing } = await adminSupabase
      .from('catalogue_items')
      .select('name, code')
      .eq('org_id', orgId);

    existingCodes = new Set((existing ?? []).map((r) => r.code).filter(Boolean) as string[]);
    existingNames = new Set((existing ?? []).map((r) => r.name.toLowerCase()));
  }

  // ── Process rows ──────────────────────────────────────────────────────────
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) { skipped++; continue; }

    const type = (['medicament', 'analyse'].includes(row.type ?? '')
      ? row.type
      : (body.default_type ?? 'medicament')) as 'medicament' | 'analyse';

    const code     = row.code?.trim() || null;
    const synonyms = row.synonyms
      ? row.synonyms.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (mode === 'add' || mode === 'replace') {
      // Skip if name or code already exists (add mode only)
      if (
        mode === 'add' &&
        (existingNames.has(name.toLowerCase()) || (code && existingCodes.has(code)))
      ) {
        skipped++;
        continue;
      }

      await adminSupabase.from('catalogue_items').insert({
        org_id: orgId, name, type, code, synonyms, metadata: row.metadata ?? {},
      });
      added++;
    } else {
      // upsert: match on name (case-insensitive) or code
      const matchOnCode = code && existingCodes.has(code);
      const matchOnName = existingNames.has(name.toLowerCase());

      if (matchOnCode || matchOnName) {
        const filter = matchOnCode
          ? adminSupabase.from('catalogue_items').update({ name, type, code, synonyms }).eq('org_id', orgId).eq('code', code!)
          : adminSupabase.from('catalogue_items').update({ name, type, code, synonyms }).eq('org_id', orgId).ilike('name', name);

        await filter;
        updated++;
      } else {
        await adminSupabase.from('catalogue_items').insert({
          org_id: orgId, name, type, code, synonyms, metadata: row.metadata ?? {},
        });
        added++;
      }
    }
  }

  // ── Record import ─────────────────────────────────────────────────────────
  const { data: importRecord } = await adminSupabase
    .from('catalogue_imports')
    .insert({
      org_id:         orgId,
      imported_by:    userId,
      filename:       body.column_mapping['_filename'] ?? 'import.csv',
      mode,
      total_rows:     rows.length,
      added,
      updated,
      skipped,
      column_mapping,
    })
    .select('id')
    .single();

  // ── Audit log ─────────────────────────────────────────────────────────────
  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'catalogue.imported',
    'catalogue_import',
    importRecord?.id ?? orgId,
    { mode, total_rows: rows.length, added, updated, skipped },
    getClientIp(request),
  );

  return NextResponse.json({ added, updated, skipped });
}
