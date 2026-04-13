'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogueItem {
  id:         string;
  name:       string;
  type:       'medicament' | 'analyse';
  code:       string | null;
  synonyms:   string[];
  metadata:   Record<string, unknown>;
  created_at: string;
}

interface LastImport {
  id:         string;
  filename:   string;
  mode:       string;
  added:      number;
  updated:    number;
  skipped:    number;
  created_at: string;
}

type FilterType = 'all' | 'medicament' | 'analyse';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: 'medicament' | 'analyse' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      type === 'medicament'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-emerald-50 text-emerald-700'
    }`}>
      {type === 'medicament' ? 'Médicament' : 'Analyse'}
    </span>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

interface ItemFormData {
  name:     string;
  type:     'medicament' | 'analyse';
  code:     string;
  synonyms: string; // comma-separated
}

interface ItemModalProps {
  item:     CatalogueItem | null; // null = create mode
  onClose:  () => void;
  onSaved:  (item: CatalogueItem) => void;
}

function ItemModal({ item, onClose, onSaved }: ItemModalProps) {
  const t = useTranslations('catalogue');
  const tCommon = useTranslations('common');

  const isEdit = item !== null;

  const [form, setForm] = useState<ItemFormData>({
    name:     item?.name     ?? '',
    type:     item?.type     ?? 'medicament',
    code:     item?.code     ?? '',
    synonyms: item?.synonyms.join(', ') ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }

    setSaving(true);
    setError(null);

    const payload = {
      name:     form.name.trim(),
      type:     form.type,
      code:     form.code.trim() || null,
      synonyms: form.synonyms.split(',').map((s) => s.trim()).filter(Boolean),
    };

    const url    = isEdit ? `/api/catalogue/items/${item.id}` : '/api/catalogue/items';
    const method = isEdit ? 'PATCH' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json() as CatalogueItem & { error?: string };

    if (!res.ok) {
      setError(data.error === 'db_failed' ? 'Erreur de base de données.' : (data.error ?? tCommon('error')));
      setSaving(false);
      return;
    }

    onSaved(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Modifier l\'article' : 'Nouvel article'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="label">{t('columns.name')} <span className="text-red-500">*</span></label>
            <input
              ref={nameRef}
              className="input-base"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="ex. Amoxicilline 500 mg"
            />
          </div>

          {/* Type */}
          <div>
            <label className="label">{t('columns.type')}</label>
            <div className="flex gap-3">
              {(['medicament', 'analyse'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={v}
                    checked={form.type === v}
                    onChange={() => setForm((f) => ({ ...f, type: v }))}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    {v === 'medicament' ? 'Médicament' : 'Analyse'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Code */}
          <div>
            <label className="label">{t('columns.code')} <span className="text-gray-400 text-xs font-normal">(optionnel)</span></label>
            <input
              className="input-base"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="ex. AMX500"
            />
          </div>

          {/* Synonyms */}
          <div>
            <label className="label">{t('columns.synonyms')} <span className="text-gray-400 text-xs font-normal">(séparés par des virgules)</span></label>
            <input
              className="input-base"
              value={form.synonyms}
              onChange={(e) => setForm((f) => ({ ...f, synonyms: e.target.value }))}
              placeholder="ex. Amoxil, Clamoxyl"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
              {tCommon('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  {tCommon('saving')}
                </span>
              ) : (
                tCommon('save')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  item:      CatalogueItem;
  onClose:   () => void;
  onDeleted: (id: string) => void;
}

function DeleteModal({ item, onClose, onDeleted }: DeleteModalProps) {
  const tCommon = useTranslations('common');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/catalogue/items/${item.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted(item.id);
    } else {
      toast.error(tCommon('error'));
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Supprimer l&apos;article</h2>
        <p className="text-sm text-gray-600 mb-6">
          Êtes-vous sûr de vouloir supprimer <span className="font-medium text-gray-900">{item.name}</span> ?
          Cette action est irréversible.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={deleting}>
            {tCommon('cancel')}
          </button>
          <button type="button" onClick={handleDelete} className="btn-danger" disabled={deleting}>
            {deleting ? (
              <span className="flex items-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Suppression...
              </span>
            ) : (
              tCommon('delete')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Last import banner ────────────────────────────────────────────────────────

function LastImportBanner({ imp }: { imp: LastImport }) {
  const t = useTranslations('catalogue');

  const modeLabel: Record<string, string> = {
    add:     'Ajout',
    upsert:  'Mise à jour',
    replace: 'Remplacement',
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <svg className="h-4 w-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span>
        <span className="font-medium">{t('lastImport')} :</span>{' '}
        {imp.filename} · {modeLabel[imp.mode] ?? imp.mode} ·{' '}
        {imp.added} ajouté{imp.added !== 1 ? 's' : ''},{' '}
        {imp.updated} mis à jour,{' '}
        {imp.skipped} ignoré{imp.skipped !== 1 ? 's' : ''} ·{' '}
        {new Date(imp.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function CataloguePage() {
  const t = useTranslations('catalogue');
  const tCommon = useTranslations('common');

  // ── State ─────────────────────────────────────────────────────────────────

  const [items,      setItems]      = useState<CatalogueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [page,       setPage]       = useState(0);

  const [lastImport, setLastImport] = useState<LastImport | null>(null);

  const [modalItem,   setModalItem]   = useState<CatalogueItem | null | 'new'>(undefined as unknown as null);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [deleteItem,  setDeleteItem]  = useState<CatalogueItem | null>(null);

  const [exporting, setExporting] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch items ───────────────────────────────────────────────────────────

  const fetchItems = useCallback(async (q: string, type: FilterType, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)              params.set('q',    q);
      if (type !== 'all') params.set('type', type);
      params.set('page',  String(pg));
      params.set('limit', String(PAGE_SIZE));

      const res  = await fetch(`/api/catalogue/items?${params}`);
      const data = await res.json() as { items: CatalogueItem[]; total: number };
      setItems(data.items ?? []);
      setTotalCount(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch last import ─────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/catalogue/last-import')
      .then((r) => r.json())
      .then((d: LastImport | null) => setLastImport(d))
      .catch(() => {/* non-fatal */});
  }, []);

  // ── Initial + filter-driven fetch ────────────────────────────────────────

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchItems(query, typeFilter, page);
    }, query ? 200 : 0);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, typeFilter, page, fetchItems]);

  // ── CSV export ────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/catalogue/export');
      if (!res.ok) throw new Error('export_failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tCommon('error'));
    } finally {
      setExporting(false);
    }
  }

  // ── Modal handlers ────────────────────────────────────────────────────────

  function openCreate() {
    setModalItem(null);
    setModalOpen(true);
  }

  function openEdit(item: CatalogueItem) {
    setModalItem(item);
    setModalOpen(true);
  }

  function handleSaved(saved: CatalogueItem) {
    const isNew = !items.find((i) => i.id === saved.id);
    if (isNew) {
      setItems((prev) => [saved, ...prev]);
      setTotalCount((c) => c + 1);
      toast.success('Article ajouté');
    } else {
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      toast.success(t('toasts.itemUpdated'));
    }
    setModalOpen(false);
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotalCount((c) => c - 1);
    setDeleteItem(null);
    toast.success(t('toasts.itemDeleted'));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
              {totalCount > 0 && (
                <p className="mt-0.5 text-sm text-gray-400">
                  {totalCount.toLocaleString('fr-FR')} article{totalCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Export + Import hidden on mobile — shown in second row */}
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || items.length === 0}
                className="btn-secondary hidden sm:flex items-center gap-2"
              >
                {exporting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <IconDownload className="h-4 w-4" />}
                {t('export')}
              </button>
              <Link href="/catalogue/importer" className="btn-secondary hidden sm:flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {t('import')}
              </Link>
              <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
                <IconPlus className="h-4 w-4" />
                <span className="hidden sm:inline">{tCommon('add')}</span>
              </button>
            </div>
          </div>

          {/* Mobile secondary action row */}
          <div className="mt-2 flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || items.length === 0}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
            >
              {exporting ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <IconDownload className="h-3.5 w-3.5" />}
              {t('export')}
            </button>
            <Link href="/catalogue/importer" className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {t('import')}
            </Link>
          </div>

          {/* Last import banner */}
          {lastImport && (
            <div className="mt-3">
              <LastImportBanner imp={lastImport} />
            </div>
          )}

          {/* Filters */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 sm:max-w-sm">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                className="input-base pl-9"
                placeholder={t('search')}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              />
            </div>

            {/* Type filter */}
            <div className="flex rounded-lg border border-navy-200 overflow-hidden self-start sm:self-auto">
              {(['all', 'medicament', 'analyse'] as FilterType[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setTypeFilter(v); setPage(0); }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    typeFilter === v
                      ? 'bg-teal-500 text-white'
                      : 'bg-white text-navy-600 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  {v === 'all' ? 'Tous' : v === 'medicament' ? 'Médicaments' : 'Analyses'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <SpinnerIcon className="h-7 w-7 animate-spin text-gray-300" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
              <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-sm text-gray-400">{query ? tCommon('noResults') : t('empty')}</p>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <table className="hidden md:table w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.name')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.type')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.code')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.synonyms')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((item) => (
                    <tr key={item.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900 max-w-xs">
                        <span className="truncate block" title={item.name}>{item.name}</span>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={item.type} /></td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {item.code ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs">
                        {item.synonyms.length > 0
                          ? <span className="truncate block text-xs" title={item.synonyms.join(', ')}>{item.synonyms.join(', ')}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => openEdit(item)} title={tCommon('edit')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteItem(item)} title={tCommon('delete')}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Mobile cards ── */}
              <div className="md:hidden divide-y divide-gray-100 bg-white">
                {items.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <TypeBadge type={item.type} />
                          {item.code && (
                            <span className="font-mono text-xs text-gray-500">{item.code}</span>
                          )}
                        </div>
                        {item.synonyms.length > 0 && (
                          <p className="mt-1 text-xs text-gray-400 truncate">{item.synonyms.join(', ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => openEdit(item)} title={tCommon('edit')}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                          <IconEdit className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteItem(item)} title={tCommon('delete')}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 sm:px-6 py-3 text-sm text-gray-500">
            <span>
              Page {page + 1} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary py-1"
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary py-1"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <ItemModal
          item={modalItem as CatalogueItem | null}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {deleteItem && (
        <DeleteModal
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
