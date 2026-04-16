import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Prescription } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  en_cours:   'En cours',
  validee:    'Validée',
};

const STATUS_COLORS: Record<string, string> = {
  en_attente: 'bg-amber-500/20 text-amber-400',
  en_cours:   'bg-blue-500/20 text-blue-400',
  validee:    'bg-teal-500/20 text-teal-400',
};

export default function PrescriptionsPage() {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let q = supabase
        .from('prescriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data } = await q;
      setPrescriptions(data ?? []);
      setLoading(false);
    })();
  }, [filter]);

  async function handleDelete(e: React.MouseEvent, p: Prescription) {
    e.stopPropagation();
    if (!confirm('Supprimer cette ordonnance ? Cette action est irréversible.')) return;

    // Delete storage file first, then the DB row (CASCADE handles prescription_items)
    await supabase.storage.from('prescriptions').remove([p.image_url]);
    const { error } = await supabase.from('prescriptions').delete().eq('id', p.id);
    if (error) { toast.error('Erreur lors de la suppression'); return; }

    setPrescriptions((prev) => prev.filter((x) => x.id !== p.id));
    toast.success('Ordonnance supprimée');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordonnances</h1>
          <p className="text-navy-400 text-sm mt-1">Historique des prescriptions scannées</p>
        </div>
        <button
          onClick={() => navigate('/prescriptions/nouvelle')}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          + Nouvelle
        </button>
      </div>

      <div className="flex gap-2">
        {['all', 'en_attente', 'en_cours', 'validee'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-teal-500/20 text-teal-400'
                : 'text-navy-400 hover:text-white hover:bg-navy-700'
            }`}
          >
            {s === 'all' ? 'Toutes' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-16 text-navy-500">Aucune ordonnance trouvée</div>
      ) : (
        <div className="space-y-2">
          {prescriptions.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-navy-800 hover:bg-navy-700 border border-navy-700 rounded-xl px-5 py-4 transition-colors"
            >
              <button
                onClick={() => navigate(`/prescriptions/${p.id}`)}
                className="flex-1 flex items-center justify-between text-left min-w-0"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white font-mono">{p.id.slice(0, 12)}…</div>
                  <div className="text-xs text-navy-500 mt-0.5">
                    {new Date(p.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ml-4 flex-shrink-0 ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </button>
              <button
                onClick={(e) => handleDelete(e, p)}
                className="flex-shrink-0 px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
