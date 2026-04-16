import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Prescription } from '@/types';

interface Stats {
  total: number;
  validated: number;
  pending: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, validated: 0, pending: 0 });
  const [recent, setRecent] = useState<Prescription[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const all = data ?? [];
      setRecent(all);
      setStats({
        total: all.length,
        validated: all.filter((p) => p.status === 'validee').length,
        pending: all.filter((p) => p.status === 'en_attente').length,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tableau de bord</h1>
        <p className="text-navy-400 text-sm mt-1">Vue d'ensemble de votre activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ordonnances totales', value: stats.total, color: 'text-white' },
          { label: 'Validées',            value: stats.validated, color: 'text-teal-400' },
          { label: 'En attente',          value: stats.pending,   color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-navy-800 rounded-xl p-5 border border-navy-700">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-navy-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick action */}
      <button
        onClick={() => navigate('/prescriptions/nouvelle')}
        className="flex items-center gap-3 px-5 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl transition-colors"
      >
        <span className="text-xl leading-none">+</span>
        Nouvelle ordonnance
      </button>

      {/* Recent prescriptions */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-navy-300 uppercase tracking-wider mb-3">
            Récentes
          </h2>
          <div className="space-y-2">
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/prescriptions/${p.id}`)}
                className="w-full flex items-center justify-between bg-navy-800 hover:bg-navy-700 border border-navy-700 rounded-lg px-4 py-3 transition-colors text-left"
              >
                <span className="text-sm text-white font-mono">
                  {p.id.slice(0, 8)}…
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  p.status === 'validee'    ? 'bg-teal-500/20 text-teal-400' :
                  p.status === 'en_cours'  ? 'bg-blue-500/20 text-blue-400' :
                                             'bg-amber-500/20 text-amber-400'
                }`}>
                  {p.status === 'validee' ? 'Validée' : p.status === 'en_cours' ? 'En cours' : 'En attente'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
