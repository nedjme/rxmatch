/**
 * AdminPage — protected route accessible only when logged in with VITE_ADMIN_EMAIL.
 * Tabs:
 *   - Catalogue: full CRUD + CSV/Excel import on global catalogue_items
 *   - Demandes: approve / reject user catalogue_requests (via SECURITY DEFINER RPC)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { CatalogueItem, CatalogueRequest } from '@/types';

type Tab = 'catalogue' | 'requests';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('catalogue');

  return (
    <div className="min-h-screen bg-navy-900">
      <header className="bg-navy-800 border-b border-navy-700 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-white">RxMatch</span>
          <span className="ml-3 text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            Administration
          </span>
        </div>
        <SignOutButton />
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <div className="flex gap-2 border-b border-navy-700">
          {(['catalogue', 'requests'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-teal-500 text-white'
                  : 'border-transparent text-navy-400 hover:text-white'
              }`}
            >
              {t === 'catalogue' ? 'Catalogue' : 'Demandes utilisateurs'}
            </button>
          ))}
        </div>

        {tab === 'catalogue' && <CatalogueAdmin />}
        {tab === 'requests'  && <RequestsAdmin />}
      </div>
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
      className="text-sm text-navy-400 hover:text-white"
    >
      Déconnexion
    </button>
  );
}

// ── Catalogue admin ────────────────────────────────────────────────────────

interface ImportRow {
  name: string;
  code?: string;
  category?: string;
  synonyms?: string;
}

function CatalogueAdmin() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogueItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState<ImportRow[] | null>(null);
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase.from('catalogue_items').select('*').order('name');
    setItems(data ?? []);
    setLoading(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Supprimer cet élément du catalogue ?')) return;
    const { error } = await supabase.rpc('admin_delete_catalogue_item', { p_id: id });
    if (error) { toast.error('Erreur lors de la suppression'); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success('Élément supprimé');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const rows = normalizeRows(result.data);
          if (rows.length === 0) { toast.error('Aucune ligne valide trouvée dans le CSV'); return; }
          setImporting(rows);
        },
        error: () => toast.error('Erreur de lecture du fichier CSV'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target!.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const rows = normalizeRows(raw);
          if (rows.length === 0) { toast.error('Aucune ligne valide trouvée dans le fichier'); return; }
          setImporting(rows);
        } catch {
          toast.error('Erreur de lecture du fichier Excel');
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error('Format non supporté. Utilisez CSV, XLS ou XLSX.');
    }
  }

  const filtered = query
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-4">
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="flex-1 px-3 py-2 bg-navy-800 border border-navy-700 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-navy-200 hover:text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          Importer CSV/Excel
        </button>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          + Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-navy-800 border border-navy-700 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm">{item.name}</span>
                  {item.code && (
                    <span className="text-xs font-mono text-navy-400 bg-navy-700 px-1.5 py-0.5 rounded">{item.code}</span>
                  )}
                  {item.category && (
                    <span className="text-xs text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">{item.category}</span>
                  )}
                </div>
                {item.synonyms.length > 0 && (
                  <div className="text-xs text-navy-500 mt-1">Synonymes : {item.synonyms.join(', ')}</div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEditing(item)}
                  className="px-3 py-1.5 text-xs bg-navy-700 hover:bg-navy-600 text-navy-300 hover:text-white rounded-lg transition-colors"
                >
                  Modifier
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-navy-500">Aucun résultat</div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <CatalogueItemForm
          item={editing ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); fetchItems(); }}
        />
      )}

      {importing && (
        <ImportPreviewModal
          rows={importing}
          onClose={() => setImporting(null)}
          onImported={() => { setImporting(null); fetchItems(); }}
        />
      )}
    </div>
  );
}

// ── Normalize import rows ──────────────────────────────────────────────────

/**
 * Accept flexible column names (case-insensitive, French or English).
 * Required: `name` / `nom`. Optional: `code`, `category`/`categorie`, `synonyms`/`synonymes`.
 * Deduplicates within the file: first occurrence of each name (case-insensitive) wins.
 */
function normalizeRows(raw: Record<string, unknown>[]): ImportRow[] {
  const seen = new Set<string>();
  const results: ImportRow[] = [];
  for (const r of raw) {
    const key = (k: string) =>
      Object.keys(r).find((c) => c.trim().toLowerCase() === k) ?? '';

    const name = String(r[key('name')] ?? r[key('nom')] ?? '').trim();
    if (!name) continue;

    const nameKey = name.toLowerCase();
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);

    results.push({
      name,
      code:     String(r[key('code')] ?? '').trim() || undefined,
      category: String(r[key('category')] ?? r[key('catégorie')] ?? r[key('categorie')] ?? '').trim() || undefined,
      synonyms: String(r[key('synonyms')] ?? r[key('synonymes')] ?? '').trim() || undefined,
    });
  }
  return results;
}

// ── Import preview modal ───────────────────────────────────────────────────

function ImportPreviewModal({
  rows,
  onClose,
  onImported,
}: {
  rows: ImportRow[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [existingNames, setExistingNames] = useState<Set<string> | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);

  // Fetch all existing catalogue names to detect DB-level duplicates
  useEffect(() => {
    supabase
      .from('catalogue_items')
      .select('name')
      .then(({ data }) => {
        setExistingNames(new Set((data ?? []).map((i) => i.name.toLowerCase())));
      });
  }, []);

  const isDuplicate = (name: string) =>
    existingNames?.has(name.toLowerCase()) ?? false;

  const newRows = existingNames
    ? rows.filter((r) => !isDuplicate(r.name))
    : rows;

  const skippedCount = rows.length - newRows.length;

  async function handleImport() {
    setImporting(true);
    const payload = newRows.map((r) => ({
      name:      r.name,
      code:      r.code || null,
      category:  r.category || null,
      synonyms:  r.synonyms
        ? r.synonyms.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      updated_at: new Date().toISOString(),
    }));

    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error } = await supabase.rpc('admin_bulk_insert_catalogue_items', {
        p_items: payload.slice(i, i + BATCH),
      });
      if (error) {
        toast.error(`Erreur à la ligne ${i + 1} : ${error.message}`);
        setImporting(false);
        return;
      }
      inserted += Math.min(BATCH, payload.length - i);
      setDone(inserted);
    }

    toast.success(
      skippedCount > 0
        ? `${inserted} importée(s), ${skippedCount} ignorée(s) (déjà dans le catalogue)`
        : `${inserted} analyse(s) importée(s) avec succès`,
    );
    onImported();
  }

  const loading = existingNames === null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Aperçu de l'import — {rows.length} ligne(s)
          </h2>
          <button onClick={onClose} disabled={importing} className="text-navy-400 hover:text-white disabled:opacity-40">✕</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {skippedCount > 0 && (
              <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-3 py-2">
                {skippedCount} ligne(s) déjà présente(s) dans le catalogue seront ignorées (fond orange).
              </div>
            )}

            <div className="overflow-y-auto flex-1 rounded-lg border border-navy-700">
              <table className="w-full text-xs">
                <thead className="bg-navy-700 sticky top-0">
                  <tr>
                    {['Nom', 'Code', 'Catégorie', 'Synonymes'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-navy-300 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const dup = isDuplicate(r.name);
                    return (
                      <tr
                        key={i}
                        className={dup
                          ? 'bg-amber-500/10 opacity-60'
                          : i % 2 === 0 ? 'bg-navy-800' : 'bg-navy-750'}
                      >
                        <td className="px-3 py-2 text-white">
                          {r.name}
                          {dup && <span className="ml-2 text-amber-400">(existant)</span>}
                        </td>
                        <td className="px-3 py-2 text-navy-400 font-mono">{r.code ?? '—'}</td>
                        <td className="px-3 py-2 text-navy-400">{r.category ?? '—'}</td>
                        <td className="px-3 py-2 text-navy-500">{r.synonyms ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {importing && (
              <div className="text-sm text-navy-300">
                Import en cours… {done}/{newRows.length}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={importing}
                className="flex-1 py-2 border border-navy-600 text-navy-300 hover:text-white rounded-lg text-sm transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || newRows.length === 0}
                className="flex-1 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                {importing
                  ? `Import… ${done}/${newRows.length}`
                  : newRows.length === 0
                    ? 'Tout déjà importé'
                    : `Importer ${newRows.length} analyse(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Catalogue item form (create / edit) ────────────────────────────────────

function CatalogueItemForm({
  item, onClose, onSaved,
}: {
  item?: CatalogueItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [synonyms, setSynonyms] = useState(item?.synonyms.join(', ') ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name:      name.trim(),
        code:      code.trim() || null,
        category:  category.trim() || null,
        synonyms:  synonyms.split(',').map((s) => s.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      };

      if (item) {
        const { error } = await supabase.rpc('admin_update_catalogue_item', {
          p_id:       item.id,
          p_name:     payload.name,
          p_code:     payload.code,
          p_category: payload.category,
          p_synonyms: payload.synonyms,
        });
        if (error) throw error;
        toast.success('Élément mis à jour');
      } else {
        const { error } = await supabase.rpc('admin_insert_catalogue_item', {
          p_name:     payload.name,
          p_code:     payload.code,
          p_category: payload.category,
          p_synonyms: payload.synonyms,
        });
        if (error) throw error;
        toast.success('Élément ajouté au catalogue');
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {item ? 'Modifier l\'analyse' : 'Ajouter une analyse'}
          </h2>
          <button onClick={onClose} className="text-navy-400 hover:text-white">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nom *">
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Numération Formule Sanguine" className={inputCls} />
          </Field>
          <Field label="Code">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="Ex : NFS" className={inputCls} />
          </Field>
          <Field label="Catégorie">
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex : Hématologie" className={inputCls} />
          </Field>
          <Field label="Synonymes (séparés par des virgules)">
            <input type="text" value={synonyms} onChange={(e) => setSynonyms(e.target.value)}
              placeholder="Ex : FSC, Hémogramme" className={inputCls} />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-navy-600 text-navy-300 hover:text-white rounded-lg text-sm transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors">
              {saving ? 'Enregistrement…' : item ? 'Mettre à jour' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Requests admin ─────────────────────────────────────────────────────────
// Uses SECURITY DEFINER RPCs so the admin can see all users' requests.

function RequestsAdmin() {
  const [requests, setRequests] = useState<CatalogueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [approving, setApproving] = useState<CatalogueRequest | null>(null);

  useEffect(() => { fetchRequests(); }, [filter]);

  async function fetchRequests() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_all_catalogue_requests', {
      p_status: filter === 'pending' ? 'pending' : null,
    });
    if (error) toast.error('Erreur de chargement des demandes');
    setRequests((data as CatalogueRequest[]) ?? []);
    setLoading(false);
  }

  async function reject(id: string) {
    const { error } = await supabase.rpc('admin_update_catalogue_request', {
      p_id:          id,
      p_status:      'rejected',
      p_reviewed_at: new Date().toISOString(),
    });
    if (error) { toast.error('Erreur lors du rejet'); return; }
    toast.success('Demande rejetée');
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-teal-500/20 text-teal-400'
                : 'text-navy-400 hover:text-white hover:bg-navy-700'
            }`}
          >
            {f === 'pending' ? 'En attente' : 'Toutes'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-navy-500">Aucune demande</div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{req.name}</span>
                    {req.code && (
                      <span className="text-xs font-mono text-navy-400 bg-navy-700 px-1.5 py-0.5 rounded">{req.code}</span>
                    )}
                    {req.category && (
                      <span className="text-xs text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">{req.category}</span>
                    )}
                  </div>
                  {req.synonyms.length > 0 && (
                    <div className="text-xs text-navy-500 mt-1">Synonymes : {req.synonyms.join(', ')}</div>
                  )}
                  {req.notes && (
                    <div className="text-xs text-navy-400 mt-1 italic">Note : {req.notes}</div>
                  )}
                  <div className="text-xs text-navy-600 mt-1">
                    {new Date(req.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  req.status === 'pending'  ? 'bg-amber-500/20 text-amber-400' :
                  req.status === 'approved' ? 'bg-teal-500/20 text-teal-400' :
                                              'bg-red-500/20 text-red-400'
                }`}>
                  {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                </span>
              </div>

              {req.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setApproving(req)}
                    className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Modifier et approuver…
                  </button>
                  <button
                    onClick={() => reject(req.id)}
                    className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded-lg transition-colors"
                  >
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {approving && (
        <ApproveRequestModal
          request={approving}
          onClose={() => setApproving(null)}
          onApproved={(id) => {
            setApproving(null);
            setRequests((prev) => prev.filter((r) => r.id !== id));
          }}
        />
      )}
    </div>
  );
}

// ── Approve-with-edit modal ────────────────────────────────────────────────

function ApproveRequestModal({
  request,
  onClose,
  onApproved,
}: {
  request: CatalogueRequest;
  onClose: () => void;
  onApproved: (id: string) => void;
}) {
  const [name,     setName]     = useState(request.name);
  const [code,     setCode]     = useState(request.code ?? '');
  const [category, setCategory] = useState(request.category ?? '');
  const [synonyms, setSynonyms] = useState(request.synonyms.join(', '));
  const [saving,   setSaving]   = useState(false);

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_approve_catalogue_request', {
        p_request_id: request.id,
        p_name:       name.trim(),
        p_code:       code.trim() || null,
        p_category:   category.trim() || null,
        p_synonyms:   synonyms.split(',').map((s) => s.trim()).filter(Boolean),
      });
      if (error) throw error;
      toast.success(`"${name.trim()}" ajouté au catalogue`);
      onApproved(request.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Approuver la demande</h2>
          <button onClick={onClose} className="text-navy-400 hover:text-white">✕</button>
        </div>

        {request.notes && (
          <div className="text-xs bg-navy-700 rounded-lg px-3 py-2 text-navy-300 italic">
            Note de l'utilisateur : {request.notes}
          </div>
        )}

        <form onSubmit={handleApprove} className="space-y-3">
          <Field label="Nom *">
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className={inputCls} />
          </Field>
          <Field label="Code">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="Ex : NFS" className={inputCls} />
          </Field>
          <Field label="Catégorie">
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex : Hématologie" className={inputCls} />
          </Field>
          <Field label="Synonymes (séparés par des virgules)">
            <input type="text" value={synonyms} onChange={(e) => setSynonyms(e.target.value)}
              placeholder="Ex : FSC, Hémogramme" className={inputCls} />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-navy-600 text-navy-300 hover:text-white rounded-lg text-sm transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors">
              {saving ? 'Ajout…' : 'Approuver et ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-navy-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
