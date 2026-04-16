import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getMacAddress } from '@/lib/tauri';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        await handleSignup();
      } else {
        await handleLogin();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error('Erreur lors de la création du compte.');

    // Bind MAC address immediately on signup
    const mac = await getMacAddress();
    if (!mac) throw new Error('Impossible de lire l\'adresse MAC de cet appareil.');

    const { error: profileError } = await supabase.from('profiles').insert({
      id:           user.id,
      full_name:    fullName.trim() || email,
      mac_address:  mac,
    });
    if (profileError) throw profileError;

    await supabase.from('user_settings').insert({ user_id: user.id });

    toast.success('Compte créé et lié à cet appareil.');
    navigate('/');
  }

  async function handleLogin() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;

    // Admin bypass — no MAC binding
    if (email === ADMIN_EMAIL) {
      navigate('/admin');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Account exists in auth but no profile yet — create it
      const mac = await getMacAddress();
      if (!mac) throw new Error('Impossible de lire l\'adresse MAC de cet appareil.');

      const { error: insertError } = await supabase.from('profiles').insert({
        id:          user.id,
        full_name:   user.email ?? '',
        mac_address: mac,
      });
      if (insertError) throw insertError;

      await supabase.from('user_settings').insert({ user_id: user.id });
      toast.success('Compte lié à cet appareil avec succès.');
      navigate('/');
      return;
    }

    // Verify MAC matches
    const mac = await getMacAddress();
    if (profile.mac_address && mac && profile.mac_address !== mac) {
      await supabase.auth.signOut();
      toast.error('Cet appareil n\'est pas autorisé pour ce compte.');
      return;
    }

    navigate('/');
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">RxMatch</h1>
          <p className="text-navy-300 mt-1 text-sm">Laboratoire d'analyses médicales</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-navy-800 rounded-xl p-6 space-y-4 shadow-xl">
          <h2 className="text-base font-semibold text-white">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h2>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-navy-200 mb-1">
                Nom complet
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Dr. Ahmed Benali"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-navy-200 mb-1">
              Adresse e-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-200 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
          >
            {loading
              ? (mode === 'login' ? 'Connexion...' : 'Création...')
              : (mode === 'login' ? 'Se connecter' : 'Créer le compte')}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); }}
              className="text-sm text-navy-400 hover:text-teal-400 transition-colors"
            >
              {mode === 'login'
                ? 'Pas encore de compte ? Créer un compte'
                : 'Déjà un compte ? Se connecter'}
            </button>
          </div>
        </form>

        <p className="text-center text-navy-500 text-xs mt-5">
          Votre compte est lié à cet appareil lors de la première connexion.
        </p>
      </div>
    </div>
  );
}
