import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getMacAddress, pickFolder } from '@/lib/tauri';
import type { Profile, UserSettings } from '@/types';

type Tab = 'device' | 'save';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('device');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setProfile(p ?? null);
      setSettings(s ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Paramètres</h1>
        <p className="text-navy-400 text-sm mt-1">Configuration de l'appareil et des préférences</p>
      </div>

      <div className="flex gap-2 border-b border-navy-700">
        {(['device', 'save'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-teal-500 text-white'
                : 'border-transparent text-navy-400 hover:text-white'
            }`}
          >
            {t === 'device' ? 'Appareil' : 'Sauvegarde locale'}
          </button>
        ))}
      </div>

      {tab === 'device' && <DeviceTab profile={profile} />}
      {tab === 'save' && settings && (
        <SaveTab settings={settings} onSettingsChange={setSettings} />
      )}
    </div>
  );
}

// ── Device tab ─────────────────────────────────────────────────────────────

function DeviceTab({ profile }: { profile: Profile | null }) {
  const [currentMac, setCurrentMac] = useState<string>('');

  useEffect(() => {
    getMacAddress().then(setCurrentMac);
  }, []);

  const macMismatch =
    !!currentMac && !!profile?.mac_address && currentMac !== profile.mac_address;

  return (
    <div className="space-y-4">
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Cet appareil</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-navy-400 text-xs mb-1">Adresse MAC liée au compte</div>
            <div className="font-mono text-white">{profile?.mac_address ?? '—'}</div>
          </div>
          <div>
            <div className="text-navy-400 text-xs mb-1">Adresse MAC actuelle</div>
            <div className={`font-mono ${macMismatch ? 'text-red-400' : 'text-teal-400'}`}>
              {currentMac || '…'}
            </div>
          </div>
        </div>

        {macMismatch && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            L'adresse MAC de cet appareil ne correspond pas à celle enregistrée sur votre compte.
          </div>
        )}
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-semibold text-white">Téléphone mobile</h2>
        <p className="text-xs text-navy-400 leading-relaxed">
          Tout téléphone ayant l'application RxMatch installée et connecté au même réseau local
          peut être utilisé pour scanner des ordonnances. Aucune configuration nécessaire —
          il suffit d'ouvrir l'application et d'appuyer sur <span className="text-white">Scanner</span>.
        </p>
      </div>
    </div>
  );
}

// ── Save tab ───────────────────────────────────────────────────────────────

function SaveTab({
  settings,
  onSettingsChange,
}: {
  settings: UserSettings;
  onSettingsChange: (s: UserSettings) => void;
}) {
  const [enabled, setEnabled] = useState(settings.local_save_enabled);
  const [folder, setFolder] = useState(settings.local_save_folder ?? '');
  const [saving, setSaving] = useState(false);

  async function handlePickFolder() {
    const picked = await pickFolder();
    if (picked) setFolder(picked);
  }

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_settings')
        .update({
          local_save_enabled: enabled,
          local_save_folder:  enabled ? (folder || null) : null,
          updated_at:         new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (data) onSettingsChange(data);
      toast.success('Paramètres sauvegardés');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-5">
      <h2 className="text-sm font-semibold text-white">Sauvegarde locale des originaux</h2>
      <p className="text-xs text-navy-400 leading-relaxed">
        Si activé, chaque ordonnance originale (avant masquage) est automatiquement sauvegardée
        dans le dossier choisi, organisée par{' '}
        <span className="text-white font-mono">AAAA/MM/JJ/</span>.
        Le serveur ne reçoit jamais l'original — uniquement la version masquée.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            enabled ? 'bg-teal-500' : 'bg-navy-600'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
        <span className="text-sm text-white">
          {enabled ? 'Sauvegarde activée' : 'Sauvegarde désactivée'}
        </span>
      </div>

      {enabled && (
        <div>
          <label className="text-xs text-navy-400 block mb-1">Dossier de destination</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={folder}
              readOnly
              placeholder="Aucun dossier sélectionné"
              className="flex-1 px-3 py-2 bg-navy-700 border border-navy-600 rounded-lg text-sm text-white placeholder-navy-500 cursor-default"
            />
            <button
              onClick={handlePickFolder}
              className="px-3 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 rounded-lg text-sm text-navy-300 hover:text-white transition-colors"
            >
              Parcourir…
            </button>
          </div>
          {folder && (
            <div className="text-xs text-navy-500 mt-1 font-mono">
              {folder}/AAAA/MM/JJ/fichier.jpg
            </div>
          )}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || (enabled && !folder)}
        className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        {saving ? 'Sauvegarde…' : 'Enregistrer'}
      </button>
    </div>
  );
}
