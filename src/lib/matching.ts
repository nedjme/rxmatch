import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogueMatch } from '@/types/extraction';

/** Boost added to a match that appears in decision_history. */
const HISTORY_BOOST = 0.3;

/** Maps Claude-returned type strings to DB catalogue types. */
const CLAUDE_TYPE_MAP: Record<string, string> = {
  medicine: 'medicament',
  lab_test: 'analyse',
};

/**
 * Returns up to 3 ranked catalogue suggestions for a single extracted name.
 *
 * Strategy:
 * 1. If `hint` (item code) is provided, attempt an exact code lookup → score 1.0
 * 2. Check decision_history for a previous human confirmation on this text
 * 3. Run trigram similarity search via search_catalogue_items RPC
 * 4. Apply +0.3 boost to the history-matched item; fetch it separately if absent
 * 5. Deduplicate, sort desc, return top 3
 */
export async function matchCatalogueItems(
  supabase:      SupabaseClient,
  orgId:         string,
  extractedName: string,
  claudeType?:   string,
  hint?:         string | null,
): Promise<CatalogueMatch[]> {
  const catalogueType =
    claudeType ? (CLAUDE_TYPE_MAP[claudeType] ?? undefined) : undefined;
  const normalizedName = extractedName.toLowerCase().trim();

  /** Deduplicated results keyed by catalogue item id. */
  const byId = new Map<string, CatalogueMatch>();

  // ── 1. Hint: exact code lookup ───────────────────────────────────────────

  if (hint) {
    const { data: hintItem } = await supabase
      .from('catalogue_items')
      .select('id, name, type, code, synonyms')
      .eq('org_id', orgId)
      .eq('code', hint)
      .maybeSingle();

    if (hintItem) {
      byId.set(hintItem.id, {
        id:           hintItem.id,
        name:         hintItem.name,
        type:         hintItem.type,
        code:         hintItem.code,
        synonyms:     hintItem.synonyms,
        score:        1.0,
        from_history: false,
      });
    }
  }

  // ── 2. Decision history ──────────────────────────────────────────────────

  const { data: histRow } = await supabase
    .from('decision_history')
    .select('matched_item_id, confirmation_count')
    .eq('org_id', orgId)
    .eq('extracted_name', normalizedName)
    .order('confirmation_count', { ascending: false })
    .limit(1)
    .maybeSingle();

  const historyItemId         = histRow?.matched_item_id ?? null;
  const historyConfirmations  = histRow?.confirmation_count ?? 0;

  // ── 3. Trigram search ────────────────────────────────────────────────────

  const { data: trigramRows } = await supabase.rpc('search_catalogue_items', {
    p_org_id: orgId,
    p_query:  extractedName,
    p_type:   catalogueType ?? null,
    p_limit:  5,
  });

  if (trigramRows) {
    for (const row of trigramRows as Array<{
      id: string; name: string; type: string; code: string;
      synonyms: string[]; score: number;
    }>) {
      const isHistory = row.id === historyItemId;
      const boost     = isHistory ? HISTORY_BOOST : 0;
      const score     = Math.min(row.score + boost, 1.0);

      const existing = byId.get(row.id);
      if (!existing || score > existing.score) {
        byId.set(row.id, {
          id:                row.id,
          name:              row.name,
          type:              row.type,
          code:              row.code,
          synonyms:          row.synonyms,
          score,
          from_history:      isHistory,
          confirmation_count: isHistory ? historyConfirmations : undefined,
        });
      }
    }
  }

  // ── 4. History item not in trigram results → fetch separately ────────────

  if (historyItemId && !byId.has(historyItemId)) {
    const { data: histItem } = await supabase
      .from('catalogue_items')
      .select('id, name, type, code, synonyms')
      .eq('id', historyItemId)
      .maybeSingle();

    if (histItem) {
      byId.set(histItem.id, {
        id:                histItem.id,
        name:              histItem.name,
        type:              histItem.type,
        code:              histItem.code,
        synonyms:          histItem.synonyms,
        score:             Math.min(HISTORY_BOOST, 1.0),
        from_history:      true,
        confirmation_count: historyConfirmations,
      });
    }
  }

  // ── 5. Sort by score desc, return top 3 ─────────────────────────────────

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
