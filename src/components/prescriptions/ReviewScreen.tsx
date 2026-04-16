/**
 * ReviewScreen — displays extracted lab tests with catalogue suggestions.
 * The user confirms, overrides, or adds notes per item, then commits.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { PrescriptionItemWithSuggestions, CatalogueMatch, CommitItem } from '@/types';

interface Props {
  prescriptionId: string;
  imageUrl: string;
  items: PrescriptionItemWithSuggestions[];
}

interface ItemState {
  selectedId: string | null;
  overridden: boolean;
  note: string;
}

export default function ReviewScreen({ prescriptionId, imageUrl, items }: Props) {
  const navigate = useNavigate();
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          selectedId: item.suggested_item_id ?? null,
          overridden: false,
          note: '',
        },
      ]),
    ),
  );
  const [committing, setCommitting] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage
      .from('prescriptions')
      .createSignedUrl(imageUrl, 3600)
      .then(({ data }) => { if (data) setSignedUrl(data.signedUrl); });
  }, [imageUrl]);

  function updateItem(itemId: string, patch: Partial<ItemState>) {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  function selectMatch(itemId: string, matchId: string, originalSuggestionId: string | null) {
    updateItem(itemId, {
      selectedId: matchId,
      overridden: matchId !== originalSuggestionId,
    });
  }

  async function handleCommit() {
    setCommitting(true);
    try {
      const commitItems: CommitItem[] = items
        .filter((item) => itemStates[item.id]?.selectedId)
        .map((item) => ({
          prescription_item_id: item.id,
          confirmed_item_id: itemStates[item.id].selectedId!,
          was_overridden: itemStates[item.id].overridden,
          operator_note: itemStates[item.id].note || null,
        }));

      // Update each prescription_item in DB
      await Promise.all(
        commitItems.map((ci) =>
          supabase
            .from('prescription_items')
            .update({
              matched_item_id: ci.confirmed_item_id,
              was_overridden:  ci.was_overridden,
              operator_note:   ci.operator_note,
            })
            .eq('id', ci.prescription_item_id),
        ),
      );

      // Update decision_history via RPC
      await Promise.all(
        commitItems.map(async (ci) => {
          const { data: catalogueItem } = await supabase
            .from('catalogue_items')
            .select('name, code')
            .eq('id', ci.confirmed_item_id)
            .single();
          if (!catalogueItem) return;
          const originalItem = items.find((i) => i.id === ci.prescription_item_id);
          if (!originalItem) return;
          await supabase.rpc('upsert_decision_history', {
            p_extracted_name:    originalItem.extracted_name,
            p_matched_item_id:   ci.confirmed_item_id,
            p_matched_item_name: catalogueItem.name,
            p_matched_item_code: catalogueItem.code ?? null,
          });
        }),
      );

      // Mark prescription validated
      await supabase
        .from('prescriptions')
        .update({ status: 'validee' })
        .eq('id', prescriptionId);

      toast.success('Ordonnance validée');
      navigate('/prescriptions');
    } catch (err) {
      toast.error('Erreur lors de la validation');
      console.error(err);
    } finally {
      setCommitting(false);
    }
  }

  const publicUrl = signedUrl ?? '';

  return (
    <div className="grid grid-cols-2 gap-6 h-[calc(100vh-7rem)]">
      {/* Left: Prescription image */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-navy-700 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Ordonnance (masquée)</span>
          <button
            onClick={() => setImageOpen(true)}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            Agrandir
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3 relative">
          {!signedUrl && (
            <div className="w-full aspect-[3/4] rounded-lg bg-navy-700 animate-pulse" />
          )}
          {signedUrl && (
            <ImageWithLoader src={signedUrl} alt="Ordonnance" className="w-full rounded-lg object-contain" />
          )}
        </div>
      </div>

      {/* Right: Extracted items */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Analyses extraites</h2>
            <p className="text-navy-400 text-xs mt-0.5">{items.length} analyse(s) détectée(s)</p>
          </div>
          <button
            onClick={handleCommit}
            disabled={committing}
            className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {committing ? 'Validation…' : 'Valider'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {items.length === 0 ? (
            <div className="text-center py-12 text-navy-500">
              Aucune analyse détectée dans cette ordonnance.
            </div>
          ) : (
            items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                state={itemStates[item.id]}
                onChange={(patch) => updateItem(item.id, patch)}
                onSelectMatch={(matchId) => selectMatch(item.id, matchId, item.suggested_item_id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {imageOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setImageOpen(false)}
        >
          <img
            src={publicUrl}
            alt="Ordonnance"
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: PrescriptionItemWithSuggestions;
  state: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
  onSelectMatch: (matchId: string) => void;
}

function ItemCard({ item, state, onChange, onSelectMatch }: ItemCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{item.extracted_name}</span>
          {item.extraction_confidence != null && (
            <ConfidencePip score={item.extraction_confidence} />
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-navy-400 hover:text-white flex-shrink-0"
        >
          {expanded ? 'Réduire' : 'Note'}
        </button>
      </div>

      <div className="space-y-1.5">
        {item.suggestions.length === 0 ? (
          <div className="text-xs text-navy-500 italic">Aucune correspondance trouvée dans le catalogue</div>
        ) : (
          item.suggestions.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              selected={state.selectedId === match.id}
              onSelect={() => onSelectMatch(match.id)}
            />
          ))
        )}
      </div>

      {expanded && (
        <div>
          <label className="text-xs text-navy-400 block mb-1">Note opérateur</label>
          <input
            type="text"
            value={state.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Optionnel…"
            className="w-full px-3 py-1.5 bg-navy-700 border border-navy-600 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, selected, onSelect }: {
  match: CatalogueMatch; selected: boolean; onSelect: () => void;
}) {
  const pct = Math.round(match.score * 100);
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
        selected
          ? 'bg-teal-500/15 border-teal-500/50 text-teal-300'
          : 'bg-navy-700 border-navy-600 text-navy-200 hover:border-navy-500 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {selected && <span className="text-teal-400 flex-shrink-0">✓</span>}
        <span className="truncate">{match.name}</span>
        {match.code && (
          <span className="text-navy-500 font-mono text-xs flex-shrink-0">{match.code}</span>
        )}
        {match.from_history && (
          <span className="flex-shrink-0 text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
            Historique
          </span>
        )}
      </div>
      <span className={`text-xs font-mono flex-shrink-0 ml-2 ${
        pct >= 80 ? 'text-teal-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
      }`}>
        {pct}%
      </span>
    </button>
  );
}

function ConfidencePip({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'text-teal-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-xs ${color}`}>({pct}%)</span>;
}

function ImageWithLoader({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded && (
        <div className="w-full aspect-[3/4] rounded-lg bg-navy-700 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`${className} ${loaded ? '' : 'hidden'}`}
      />
    </div>
  );
}
