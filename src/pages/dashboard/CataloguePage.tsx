import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { CatalogueItem, CatalogueRequest } from '@/types';

type Tab = 'catalogue' | 'requests';

export default function CataloguePage() {
  const [tab, setTab] = useState<Tab>('catalogue');
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [requests, setRequests] = useState<CatalogueRequest[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);

  useEffect(() => {
    fetchItems();
    fetchRequests();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase.from('catalogue_items').select('*').order('name');
    setItems(data ?? []);
    setLoading(false);
  }

  async function fetchRequests() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('catalogue_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
  }

  const filtered = query.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.code ?? '').toLowerCase().includes(query.toLowerCase()) ||
        i.synonyms.some((s) => s.toLowerCase().includes(query.toLowerCase())),
      )
    : items;

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Catalogue des analyses</h1>
          <p className="text-navy-400 text-sm mt-1">{items.length} analyse(s) dans la base</p>
        </div>
        <button
          onClick={() => setShowRequest(true)}
          className="flex items-center gap-2 px-4 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Demande d'ajout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-navy-700">
        {(['catalogue', 'requests'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              tab === t
                ? 'border-teal-500 text-white'
                : 'border-transparent text-navy-400 hover:text-white'
            }`}
          >
            {t === 'catalogue' ? 'Catalogue' : 'Mes demandes'}
            {t === 'requests' && pendingCount > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Catalogue tab */}
      {tab === 'catalogue' && (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, code, synonyme…"
            className="w-full px-4 py-2.5 bg-navy-800 border border-navy-700 rounded-xl text-white placeholder-navy-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          />

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-navy-500">Aucun résultat</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div key={item.id} className="bg-navy-800 border border-navy-700 rounded-xl px-5 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <span className="text-white font-medium text-sm">{item.name}</span>
                    {item.code && (
                      <span className="text-xs font-mono text-navy-400 bg-navy-700 px-1.5 py-0.5 rounded">
                        {item.code}
                      </span>
                    )}
                    {item.category && (
                      <span className="text-xs text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.synonyms.length > 0 && (
                    <div className="text-xs text-navy-500 mt-1">
                      Synonymes : {item.synonyms.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <RequestsList requests={requests} />
      )}

      {showRequest && (
        <RequestModal
          onClose={() => setShowRequest(false)}
          onSubmitted={(req) => {
            setRequests((prev) => [req, ...prev]);
            setTab('requests');
          }}
        />
      )}
    </div>
  );
}

// ── User's requests list ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending:  'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
};
const STATUS_COLOR: Record<string, string> = {
  pending:  'bg-amber-500/20 text-amber-400',
  approved: 'bg-teal-500/20 text-teal-400',
  rejected: 'bg-red-500/20 text-red-400',
};

function RequestsList({ requests }: { requests: CatalogueRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-navy-500">
        Vous n'avez soumis aucune demande.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div key={req.id} className="bg-navy-800 border border-navy-700 rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-medium text-sm">{req.name}</span>
                {req.code && (
                  <span className="text-xs font-mono text-navy-400 bg-navy-700 px-1.5 py-0.5 rounded">
                    {req.code}
                  </span>
                )}
                {req.category && (
                  <span className="text-xs text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">
                    {req.category}
                  </span>
                )}
              </div>
              {req.synonyms.length > 0 && (
                <div className="text-xs text-navy-500 mt-1">Synonymes : {req.synonyms.join(', ')}</div>
              )}
              <div className="text-xs text-navy-600 mt-1">
                Soumis le {new Date(req.created_at).toLocaleDateString('fr-FR')}
                {req.reviewed_at && ` · Traité le ${new Date(req.reviewed_at).toLocaleDateString('fr-FR')}`}
              </div>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[req.status]}`}>
              {STATUS_LABEL[req.status]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Request modal ──────────────────────────────────────────────────────────

function RequestModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: (req: CatalogueRequest) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const { data, error } = await supabase
        .from('catalogue_requests')
        .insert({
          user_id:  user.id,
          name:     name.trim(),
          code:     code.trim() || null,
          category: category.trim() || null,
          synonyms: synonyms.split(',').map((s) => s.trim()).filter(Boolean),
          notes:    notes.trim() || null,
          status:   'pending',
        })
        .select('*')
        .single();

      if (error) throw error;
      toast.success('Demande envoyée — l\'administrateur la traitera prochainement');
      onSubmitted(data);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Demande d'ajout au catalogue</h2>
          <button onClick={onClose} className="text-navy-400 hover:text-white">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nom de l'analyse *">
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
          <Field label="Notes pour l'administrateur">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder="Contexte ou précisions…"
              className={inputCls + ' resize-none'} />
          </Field>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-navy-600 text-navy-300 hover:text-white rounded-lg text-sm transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={submitting || !name.trim()}
              className="flex-1 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors">
              {submitting ? 'Envoi…' : 'Envoyer'}
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
