'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ImageViewer } from './ImageViewer';
import { ConfidenceBadge } from './ConfidenceBadge';
import { HistoryBadge } from './HistoryBadge';
import type { CatalogueMatch, PrescriptionItemWithSuggestions } from '@/types/extraction';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrescriptionMeta {
  id:               string;
  status:           'en_attente' | 'en_cours' | 'validee';
  createdAt:        string;
  legibility:       'good' | 'partial' | 'poor';
  language:         string;
  handwritten:      boolean;
  patientName:      string | null;
  doctorName:       string | null;
  prescriptionDate: string | null;
}

interface ItemState {
  id:              string;
  extractedName:   string;
  extractedDose:   string | null;
  extractedFrequency: string | null;
  confidence:      number | null;
  suggestedItemId: string | null;
  suggestions:     CatalogueMatch[];
  // Selection
  selected:        CatalogueMatch | null;
  // Manual search
  searchOpen:      boolean;
  searchQuery:     string;
  searchResults:   CatalogueMatch[];
  searchLoading:   boolean;
  // Operator note
  noteOpen:        boolean;
  operatorNote:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function typeLabel(type: string): string {
  return type === 'medicament' ? 'Médicament' : 'Analyse';
}

function scorePercent(score: number): string {
  return `${Math.round(score * 100)} %`;
}

// ── InfoField ─────────────────────────────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-gray-400 shrink-0">{label} :</span>
      <span className="text-xs font-medium text-gray-700 truncate">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copié !' : 'Copier'}
        className={`shrink-0 rounded p-0.5 transition-colors ${
          copied ? 'text-green-500' : 'text-gray-300 hover:text-gray-500'
        }`}
      >
        {copied ? (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ── SuggestionCard ────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  match:      CatalogueMatch;
  isSelected: boolean;
  onSelect:   () => void;
  onDismiss:  () => void;
}

function SuggestionCard({ match, isSelected, onSelect, onDismiss }: SuggestionCardProps) {
  return (
    <div className="relative group/card">
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left rounded-lg border p-3 transition-colors duration-100 ${
          isSelected
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
            {match.name}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${
            isSelected ? 'text-blue-600' : 'text-gray-400'
          }`}>
            {scorePercent(match.score)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {match.code && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
              {match.code}
            </span>
          )}
          <span className={`badge ${
            match.type === 'medicament'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-violet-100 text-violet-700'
          }`}>
            {typeLabel(match.type)}
          </span>
          {match.from_history && match.confirmation_count != null && (
            <HistoryBadge count={match.confirmation_count} />
          )}
        </div>
      </button>

      {/* Dismiss button — always visible on touch, hover-only on desktop */}
      {!isSelected && (
        <button
          type="button"
          title="Retirer cette suggestion"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-400 text-white hover:bg-gray-600 transition-colors lg:hidden lg:group-hover/card:flex"
        >
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── ManualSearch ──────────────────────────────────────────────────────────────

interface ManualSearchProps {
  query:      string;
  results:    CatalogueMatch[];
  loading:    boolean;
  inputRef:   React.RefObject<HTMLInputElement>;
  onChange:   (q: string) => void;
  onSelect:   (match: CatalogueMatch) => void;
  onClose:    () => void;
}

function ManualSearch({
  query, results, loading, inputRef, onChange, onSelect, onClose,
}: ManualSearchProps) {
  return (
    <div className="mt-2 rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Recherche manuelle..."
          className="flex-1 text-sm outline-none placeholder-gray-400"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          }}
        />
        {loading && (
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        <button type="button" onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs">Esc</button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-52 overflow-y-auto divide-y divide-gray-50">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                onClick={() => onSelect(r)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-400">
                    {r.code && <span className="font-mono mr-2">{r.code}</span>}
                    {typeLabel(r.type)}
                  </p>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">{scorePercent(r.score)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.length >= 2 && results.length === 0 && !loading && (
        <p className="px-3 py-3 text-sm text-gray-400">Aucun résultat</p>
      )}
    </div>
  );
}

// ── ItemCard ──────────────────────────────────────────────────────────────────

interface ItemCardProps {
  state:          ItemState;
  isFocused:      boolean;
  readOnly:     boolean;
  onFocus:        () => void;
  onSelect:       (match: CatalogueMatch) => void;
  onSearchOpen:   () => void;
  onSearchClose:  () => void;
  onSearchChange: (q: string) => void;
  onSearchSelect: (match: CatalogueMatch) => void;
  onNoteToggle:   () => void;
  onNoteChange:   (note: string) => void;
  onDelete:            () => void;
  onDismissSuggestion: (id: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
}

function ItemCard({
  state, isFocused, readOnly, onFocus, onSelect,
  onSearchOpen, onSearchClose, onSearchChange, onSearchSelect,
  onNoteToggle, onNoteChange, onDelete, onDismissSuggestion, searchInputRef,
}: ItemCardProps) {

  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!state.selected) return;
    const text = state.selected.code
      ? `${state.selected.name} (${state.selected.code})`
      : state.selected.name;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      role="group"
      onClick={onFocus}
      className={`rounded-xl border p-4 transition-colors duration-100 cursor-default ${
        isFocused ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">{state.extractedName}</h3>
            {state.selected && (
              <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd" />
              </svg>
            )}
          </div>
          {(state.extractedDose || state.extractedFrequency) && (
            <p className="mt-0.5 text-xs text-gray-500">
              {[state.extractedDose, state.extractedFrequency].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Actions + confidence */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Copy — only when a match is selected */}
          {state.selected && (
            <button
              type="button"
              title={copied ? 'Copié !' : 'Copier'}
              onClick={handleCopy}
              className={`rounded p-1 transition-colors ${
                copied
                  ? 'bg-green-50 text-green-600'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
            >
              {copied ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
          {/* Delete item — hidden in read-only mode */}
          {!readOnly && (
            <button
              type="button"
              title="Retirer cet article"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <ConfidenceBadge confidence={state.confidence} />
        </div>
      </div>

      {/* Suggestion cards */}
      {state.suggestions.length > 0 ? (
        <div className="grid gap-2 grid-cols-1 lg:grid-cols-3">
          {state.suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              match={s}
              isSelected={state.selected?.id === s.id}
              onSelect={() => onSelect(s)}
              onDismiss={() => onDismissSuggestion(s.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-2">Aucune suggestion — utilisez la recherche manuelle.</p>
      )}

      {/* Manual search */}
      <div className="mt-3">
        {state.searchOpen ? (
          <ManualSearch
            query={state.searchQuery}
            results={state.searchResults}
            loading={state.searchLoading}
            inputRef={searchInputRef}
            onChange={onSearchChange}
            onSelect={onSearchSelect}
            onClose={onSearchClose}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSearchOpen(); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Recherche manuelle
          </button>
        )}
      </div>

      {/* Operator note */}
      <div className="mt-2">
        {state.noteOpen ? (
          <textarea
            value={state.operatorNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Note opérateur..."
            rows={2}
            className="input-base text-xs resize-none mt-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNoteToggle(); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {state.operatorNote ? 'Modifier la note' : 'Ajouter une note'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── ReviewScreen ──────────────────────────────────────────────────────────────

interface ReviewScreenProps {
  prescription: PrescriptionMeta;
  items:        PrescriptionItemWithSuggestions[];
  imageUrl:     string;
}

export function ReviewScreen({ prescription, items, imageUrl }: ReviewScreenProps) {
  const router = useRouter();
  const t      = useTranslations('prescriptions.review');

  // ── Item state ────────────────────────────────────────────────────────────

  const [itemStates, setItemStates] = useState<ItemState[]>(() =>
    items.map((item) => ({
      id:              item.id,
      extractedName:   item.extracted_name,
      extractedDose:   item.extracted_dose,
      extractedFrequency: item.extracted_frequency,
      confidence:      item.extraction_confidence,
      suggestedItemId: item.suggested_item_id,
      suggestions:     item.suggestions,
      selected:        item.matched_item_id
        ? (item.suggestions.find((s) => s.id === item.matched_item_id) ?? null)
        : null,
      searchOpen:    false,
      searchQuery:   '',
      searchResults: [],
      searchLoading: false,
      noteOpen:      !!item.operator_note,
      operatorNote:  item.operator_note ?? '',
    })),
  );

  const [focusedIndex,  setFocusedIndex]  = useState(0);
  const [isCommitting,  setIsCommitting]  = useState(false);
  const [isDeleting,    setIsDeleting]    = useState(false);
  const [isReopening,   setIsReopening]   = useState(false);
  const [readOnly,      setReadOnly]      = useState(prescription.status === 'validee');
  const [activeTab,     setActiveTab]     = useState<'image' | 'items'>('items');

  const searchInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const itemRefs        = useRef<(HTMLDivElement | null)[]>([]);

  const confirmedCount = itemStates.filter((s) => s.selected !== null).length;
  const allConfirmed   = confirmedCount === itemStates.length;

  // ── State updater ─────────────────────────────────────────────────────────

  function updateItem(index: number, patch: Partial<ItemState>) {
    setItemStates((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function deleteItem(index: number) {
    setItemStates((prev) => prev.filter((_, i) => i !== index));
    setFocusedIndex((prev) => Math.max(0, prev > index ? prev - 1 : prev));
  }

  // ── Prescription-level actions ────────────────────────────────────────────

  async function handleDelete() {
    if (!window.confirm('Supprimer cette ordonnance ? Cette action est irréversible.')) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/prescriptions/${prescription.id}`, { method: 'DELETE' });
      router.push('/ordonnances');
    } catch {
      toast.error('Erreur lors de la suppression.');
      setIsDeleting(false);
    }
  }

  async function handleReopen() {
    setIsReopening(true);
    try {
      const res = await fetch(`/api/prescriptions/${prescription.id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      // Reset all item confirmations locally
      setItemStates((prev) => prev.map((s) => ({ ...s, selected: null, operatorNote: '', noteOpen: false })));
      setReadOnly(false);
      toast.success('Ordonnance réouverte pour révision.');
    } catch {
      toast.error('Erreur lors de la réouverture.');
    } finally {
      setIsReopening(false);
    }
  }

  // ── Manual search (debounced) ─────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce(async (query: string, index: number) => {
      if (query.length < 2) {
        updateItem(index, { searchResults: [], searchLoading: false });
        return;
      }
      updateItem(index, { searchLoading: true });
      try {
        const res  = await fetch(`/api/catalogue/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as CatalogueMatch[];
        updateItem(index, { searchResults: data, searchLoading: false });
      } catch {
        updateItem(index, { searchResults: [], searchLoading: false });
      }
    }, 300),
    [],
  );

  function handleSearchChange(index: number, query: string) {
    updateItem(index, { searchQuery: query });
    debouncedSearch(query, index);
  }

  function handleSearchOpen(index: number) {
    updateItem(index, { searchOpen: true, searchQuery: '', searchResults: [] });
    // Focus the search input on next tick
    setTimeout(() => {
      searchInputRefs.current[index]?.focus();
    }, 50);
  }

  function handleSearchSelect(index: number, match: CatalogueMatch) {
    setItemStates((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const alreadyPresent = item.suggestions.some((s) => s.id === match.id);
        return {
          ...item,
          selected:     match,
          searchOpen:   false,
          searchQuery:  '',
          searchResults: [],
          suggestions:  alreadyPresent ? item.suggestions : [{ ...match, score: 1 }, ...item.suggestions],
        };
      }),
    );
    const next = itemStates.findIndex((s, i) => i > index && s.selected === null);
    if (next >= 0) setFocusedIndex(next);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.key === 'Escape' && inInput) {
        (target as HTMLInputElement).blur();
        // Close any open search
        setItemStates((prev) =>
          prev.map((s) => ({ ...s, searchOpen: false })),
        );
        return;
      }

      if (inInput) return;

      switch (e.key) {
        case 'Tab': {
          e.preventDefault();
          const next = itemStates.findIndex(
            (s, i) => i > focusedIndex && s.selected === null,
          );
          const wrap = itemStates.findIndex((s) => s.selected === null);
          const target = next >= 0 ? next : wrap >= 0 ? wrap : focusedIndex;
          setFocusedIndex(target);
          itemRefs.current[target]?.scrollIntoView({ block: 'nearest' });
          break;
        }
        case 'Enter': {
          const item = itemStates[focusedIndex];
          if (item && !item.selected && item.suggestions.length > 0) {
            const top = item.suggestions[0];
            updateItem(focusedIndex, { selected: top });
            const next = itemStates.findIndex(
              (s, i) => i > focusedIndex && s.selected === null,
            );
            if (next >= 0) setFocusedIndex(next);
          }
          break;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          handleSearchOpen(focusedIndex);
          break;
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, itemStates]);

  // ── Commit ────────────────────────────────────────────────────────────────

  async function handleCommit() {
    if (!allConfirmed || isCommitting) return;

    setIsCommitting(true);

    const payload = {
      items: itemStates.map((s) => ({
        prescription_item_id: s.id,
        confirmed_item_id:    s.selected!.id,
        was_overridden:       s.selected!.id !== s.suggestedItemId,
        operator_note:        s.operatorNote.trim() || null,
      })),
    };

    try {
      const res = await fetch(`/api/prescriptions/${prescription.id}/commit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error === 'already_committed'
          ? 'Cette ordonnance a déjà été validée.'
          : 'Une erreur est survenue. Veuillez réessayer.');
        setIsCommitting(false);
        return;
      }

      toast.success(t('successToast'));
      router.push('/ordonnances');
    } catch {
      toast.error('Erreur réseau. Veuillez réessayer.');
      setIsCommitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen overflow-hidden">

      {/* ── Mobile tab bar ─────────────────────────────────────────────────── */}
      <div className="lg:hidden flex border-b border-gray-200 bg-white flex-shrink-0">
        {(['image', 'items'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-teal-500 text-teal-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'image' ? 'Ordonnance' : `Articles (${confirmedCount}/${itemStates.length})`}
          </button>
        ))}
      </div>

      {/* ── Panels ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

      {/* LEFT PANEL — image viewer */}
      <div className={`${activeTab === 'image' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[45%] flex-shrink-0 flex-col border-r border-gray-200`}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <a
            href="/ordonnances"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              Ordonnance
            </p>
            <p className="text-xs text-gray-400">
              {new Date(prescription.createdAt).toLocaleDateString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {readOnly && (
              <span className="badge bg-green-100 text-green-700">Validée</span>
            )}
            {/* Réviser — only on validated prescriptions */}
            {readOnly && (
              <button
                type="button"
                disabled={isReopening}
                onClick={handleReopen}
                title="Réviser l'ordonnance"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {/* Supprimer */}
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              title="Supprimer l'ordonnance"
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Patient / Doctor / Date info */}
        {(prescription.patientName || prescription.doctorName || prescription.prescriptionDate) && (
          <div className="border-b border-gray-100 px-4 py-2.5 bg-gray-50 flex flex-wrap gap-x-4 gap-y-1.5">
            {[
              { label: 'Patient', value: prescription.patientName },
              { label: 'Médecin', value: prescription.doctorName },
              { label: 'Date',    value: prescription.prescriptionDate },
            ].filter((f) => f.value).map((field) => (
              <InfoField key={field.label} label={field.label} value={field.value!} />
            ))}
          </div>
        )}

        {/* Image */}
        <div className="flex-1 overflow-hidden">
          <ImageViewer
            imageUrl={imageUrl}
            legibility={prescription.legibility}
            language={prescription.language}
            handwritten={prescription.handwritten}
          />
        </div>
      </div>

      {/* RIGHT PANEL — items */}
      <div className={`${activeTab === 'items' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[55%] flex-col min-h-0`}>
        {/* Low legibility warning */}
        {prescription.legibility === 'poor' && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd" />
            </svg>
            {t('lowLegibility')}
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {itemStates.map((state, i) => (
            <div key={state.id} ref={(el) => { itemRefs.current[i] = el; }}>
              <ItemCard
                state={state}
                isFocused={focusedIndex === i}
                isReadOnly={readOnly}
                onFocus={() => setFocusedIndex(i)}
                onSelect={(match) => {
                  updateItem(i, { selected: match, searchOpen: false });
                  const next = itemStates.findIndex((s, j) => j > i && s.selected === null);
                  if (next >= 0) setFocusedIndex(next);
                }}
                onSearchOpen={() => handleSearchOpen(i)}
                onSearchClose={() => updateItem(i, { searchOpen: false, searchQuery: '', searchResults: [] })}
                onSearchChange={(q) => handleSearchChange(i, q)}
                onSearchSelect={(match) => handleSearchSelect(i, match)}
                onNoteToggle={() => updateItem(i, { noteOpen: !state.noteOpen })}
                onNoteChange={(note) => updateItem(i, { operatorNote: note })}
                onDelete={() => deleteItem(i)}
                onDismissSuggestion={(id) =>
                  updateItem(i, {
                    suggestions: state.suggestions.filter((s) => s.id !== id),
                    selected: state.selected?.id === id ? null : state.selected,
                  })
                }
                searchInputRef={{ current: searchInputRefs.current[i] } as React.RefObject<HTMLInputElement>}
              />
            </div>
          ))}

          {itemStates.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              Aucun article extrait.
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Progress */}
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{confirmedCount}</span>
              {' / '}
              <span className="font-semibold text-gray-900">{itemStates.length}</span>
              {' articles confirmés'}
            </div>

            {/* Validate button */}
            {!readOnly && (
              <button
                type="button"
                disabled={!allConfirmed || isCommitting}
                onClick={handleCommit}
                className="btn-primary"
              >
                {isCommitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Validation...
                  </span>
                ) : (
                  t('validateButton')
                )}
              </button>
            )}
          </div>

          {/* Keyboard hints */}
          {!readOnly && (
            <p className="mt-1.5 text-xs text-gray-400">
              {t('keyboardHints')}
            </p>
          )}
        </div>
      </div>

      </div> {/* end panels wrapper */}
    </div>
  );
}
