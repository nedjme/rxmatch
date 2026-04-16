import { supabase } from './supabase';
import type { CatalogueMatch } from '@/types';

const HISTORY_BOOST = 0.3;

/**
 * Returns up to 3 ranked catalogue suggestions for a single extracted lab test name.
 *
 * Strategy:
 * 1. If hint (item code) provided → exact code lookup → score 1.0
 * 2. Check decision_history for prior human confirmation → +0.3 boost
 * 3. Trigram similarity search via search_catalogue_items RPC
 * 4. Deduplicate, sort desc, return top 3
 */
export async function matchCatalogueItems(
  extractedName: string,
  hint?: string | null,
): Promise<CatalogueMatch[]> {
  const normalizedName = extractedName.toLowerCase().trim();
  const byId = new Map<string, CatalogueMatch>();

  // ── 1. Hint: exact code lookup ──────────────────────────────────────────

  if (hint) {
    const { data: hintItem } = await supabase
      .from('catalogue_items')
      .select('id, name, code, synonyms, category')
      .eq('code', hint)
      .maybeSingle();

    if (hintItem) {
      byId.set(hintItem.id, {
        id: hintItem.id,
        name: hintItem.name,
        code: hintItem.code,
        synonyms: hintItem.synonyms,
        category: hintItem.category,
        score: 1.0,
        from_history: false,
      });
    }
  }

  // ── 2. Decision history ─────────────────────────────────────────────────

  const { data: histRow } = await supabase
    .from('decision_history')
    .select('matched_item_id, confirmation_count')
    .eq('extracted_name', normalizedName)
    .order('confirmation_count', { ascending: false })
    .limit(1)
    .maybeSingle();

  const historyItemId = histRow?.matched_item_id ?? null;
  const historyConfirmations = histRow?.confirmation_count ?? 0;

  // ── 3. Trigram search ───────────────────────────────────────────────────

  const { data: trigramRows } = await supabase.rpc('search_catalogue_items', {
    p_query: extractedName,
    p_limit: 8,
    p_threshold: 0.25,
    p_category: null,
  });

  if (trigramRows) {
    for (const row of trigramRows as Array<{
      id: string; name: string; code: string | null;
      synonyms: string[]; category: string | null; score: number;
    }>) {
      const isHistory = row.id === historyItemId;
      const score = Math.min(row.score + (isHistory ? HISTORY_BOOST : 0), 1.0);
      const existing = byId.get(row.id);
      if (!existing || score > existing.score) {
        byId.set(row.id, {
          id: row.id,
          name: row.name,
          code: row.code,
          synonyms: row.synonyms,
          category: row.category,
          score,
          from_history: isHistory,
          confirmation_count: isHistory ? historyConfirmations : undefined,
        });
      }
    }
  }

  // ── 4. History item not in trigram results → fetch separately ───────────

  if (historyItemId && !byId.has(historyItemId)) {
    const { data: histItem } = await supabase
      .from('catalogue_items')
      .select('id, name, code, synonyms, category')
      .eq('id', historyItemId)
      .maybeSingle();

    if (histItem) {
      byId.set(histItem.id, {
        id: histItem.id,
        name: histItem.name,
        code: histItem.code,
        synonyms: histItem.synonyms,
        category: histItem.category,
        score: Math.min(HISTORY_BOOST, 1.0),
        from_history: true,
        confirmation_count: historyConfirmations,
      });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
