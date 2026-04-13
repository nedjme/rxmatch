import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import { requireOrgMember, getClientIp } from '@/lib/api';
import { matchCatalogueItems } from '@/lib/matching';
import type { ExtractionResult } from '@/types/extraction';

const STORAGE_BUCKET  = 'prescriptions';
const ACCEPTED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES       = 10 * 1024 * 1024; // 10 MB
const ROLES_ALLOWED   = ['admin', 'pharmacist', 'lab_tech'];

// ── System prompt builder ────────────────────────────────────────────────────

interface HistoryRow {
  extracted_name:    string;
  matched_item_name: string;
  matched_item_code: string | null;
  confirmation_count: number;
}

function buildSystemPrompt(history: HistoryRow[]): string {
  let prompt = `You are a medical prescription reader for a pharmacy/laboratory system.
Analyze this prescription image and extract all medicines and lab tests.`;

  if (history.length > 0) {
    prompt += `\n\nThis organisation has previously confirmed these name mappings — use them as strong hints if you see similar text:\n`;
    for (const h of history) {
      prompt += `- "${h.extracted_name}" → ${h.matched_item_name} (code: ${h.matched_item_code ?? 'N/A'}, confirmed ${h.confirmation_count} times)\n`;
    }
  }

  prompt += `

Return ONLY valid JSON with this exact structure, no markdown, no extra text:
{
  "items": [
    {
      "extracted_name": "name exactly as written",
      "type": "medicine" or "lab_test",
      "dose": "dosage string or null",
      "frequency": "frequency string or null",
      "confidence": 0.0 to 1.0,
      "hint": "matched_item_code if recognised from examples, otherwise null"
    }
  ],
  "language": "fr" or "ar" or "en" or other,
  "handwritten": true or false,
  "legibility": "good" or "partial" or "poor",
  "notes": "any observations about ambiguity or illegibility",
  "patient_name": "full name of patient or null if not found",
  "doctor_name": "full name and/or title of the prescribing doctor or null if not found",
  "prescription_date": "date as written on the prescription or null if not found"
}

If legibility is "poor", still extract what you can but set confidence below 0.5.`;

  return prompt;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const auth = await requireOrgMember(ROLES_ALLOWED);
  if (!auth.ok) return auth.response;
  const { userId, orgId } = auth.data;

  // ── Parse form data ───────────────────────────────────────────────────────

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const imageFile = formData.get('image') as File | null;

  if (!imageFile) {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }
  if (!ACCEPTED_TYPES.has(imageFile.type)) {
    return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  }
  if (imageFile.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  // ── Upload to Supabase Storage ────────────────────────────────────────────

  const ext         = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const imageBytes  = await imageFile.arrayBuffer();

  const { error: uploadError } = await adminSupabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, imageBytes, { contentType: imageFile.type });

  if (uploadError) {
    return NextResponse.json(
      { error: 'upload_failed', details: uploadError.message },
      { status: 500 },
    );
  }

  // ── Query decision_history ────────────────────────────────────────────────

  const { data: history } = await adminSupabase
    .from('decision_history')
    .select(
      'extracted_name, matched_item_name, matched_item_code, confirmation_count',
    )
    .eq('org_id', orgId)
    .order('confirmation_count', { ascending: false })
    .limit(20);

  // ── Call Claude ───────────────────────────────────────────────────────────

  const systemPrompt = buildSystemPrompt((history ?? []) as HistoryRow[]);
  const base64Image  = Buffer.from(imageBytes).toString('base64');
  const mediaType    = imageFile.type as
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'image/gif';

  let rawText: string;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message   = await anthropic.messages.create({
      model:      process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: 'Extract all medicines and lab tests from this prescription image.',
            },
          ],
        },
      ],
    });

    rawText =
      message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (err) {
    // Roll back uploaded file
    await adminSupabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: 'claude_failed', details: String(err) },
      { status: 502 },
    );
  }

  // ── Parse extraction JSON ─────────────────────────────────────────────────

  let extraction: ExtractionResult;
  try {
    // Strip possible markdown code fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    extraction = JSON.parse(cleaned) as ExtractionResult;
  } catch {
    return NextResponse.json(
      { error: 'parse_failed', raw: rawText },
      { status: 422 },
    );
  }

  // Normalise items array
  if (!Array.isArray(extraction.items)) extraction.items = [];

  // ── Match each item against catalogue ────────────────────────────────────

  const suggestions = await Promise.all(
    extraction.items.map((item) =>
      matchCatalogueItems(
        adminSupabase,
        orgId,
        item.extracted_name,
        item.type,
        item.hint,
      ),
    ),
  );

  // ── Persist prescription ──────────────────────────────────────────────────

  const { data: prescription, error: presError } = await adminSupabase
    .from('prescriptions')
    .insert({
      org_id:         orgId,
      uploaded_by:    userId,
      image_url:      storagePath,
      raw_extraction: extraction,
      status:         'en_attente',
    })
    .select('id')
    .single();

  if (presError || !prescription) {
    await adminSupabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'db_failed' }, { status: 500 });
  }

  // ── Persist prescription items ────────────────────────────────────────────

  const itemRows = extraction.items.map((item, i) => ({
    prescription_id:       prescription.id,
    extracted_name:        item.extracted_name,
    extracted_dose:        item.dose         ?? null,
    extracted_frequency:   item.frequency    ?? null,
    extraction_confidence: item.confidence,
    suggested_item_id:     suggestions[i]?.[0]?.id    ?? null,
    match_score:           suggestions[i]?.[0]?.score ?? null,
  }));

  const { data: savedItems } = await adminSupabase
    .from('prescription_items')
    .insert(itemRows)
    .select('*');

  // ── Upsert scan_usage ─────────────────────────────────────────────────────

  const now = new Date();
  await adminSupabase.rpc('increment_scan_usage', {
    p_org_id: orgId,
    p_year:   now.getFullYear(),
    p_month:  now.getMonth() + 1,
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  await logAuditEvent(
    adminSupabase,
    orgId,
    userId,
    'prescription.uploaded',
    'prescription',
    prescription.id,
    {
      item_count:  extraction.items.length,
      legibility:  extraction.legibility ?? null,
      handwritten: extraction.handwritten ?? null,
    },
    getClientIp(request),
  );

  // ── Return ────────────────────────────────────────────────────────────────

  const itemsWithSuggestions = (savedItems ?? []).map((item, i) => ({
    ...item,
    suggestions: suggestions[i] ?? [],
  }));

  return NextResponse.json({
    prescription_id: prescription.id,
    extraction,
    items:           itemsWithSuggestions,
  });
}
