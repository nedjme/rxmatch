'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface OrgSettings {
  id:                   string;
  name:                 string;
  slug:                 string;
  confidence_threshold: number;
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function OrgTab() {
  const t       = useTranslations('settings.organisation');
  const tCommon = useTranslations('common');

  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [name,     setName]     = useState('');
  const [threshold, setThreshold] = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    fetch('/api/org/settings')
      .then((r) => r.json())
      .then((data: OrgSettings) => {
        setSettings(data);
        setName(data.name);
        setThreshold(String(data.confidence_threshold));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const t_val = parseFloat(threshold);
    if (isNaN(t_val) || t_val < 0 || t_val > 1) return;

    setSaving(true);
    const res  = await fetch('/api/org/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), confidence_threshold: t_val }),
    });
    const data = await res.json() as OrgSettings & { error?: string };
    setSaving(false);

    if (!res.ok) {
      toast.error(tCommon('error'));
      return;
    }

    setSettings(data);
    toast.success(t('saveSuccess'));
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-md">
      {/* Org name */}
      <div>
        <label className="label">{t('name')}</label>
        <input
          className="input-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Slug — read-only */}
      <div>
        <label className="label">Identifiant (slug)</label>
        <input
          className="input-base bg-gray-50 text-gray-400 cursor-not-allowed"
          value={settings?.slug ?? ''}
          readOnly
          tabIndex={-1}
        />
        <p className="mt-1 text-xs text-gray-400">L&apos;identifiant ne peut pas être modifié après la création.</p>
      </div>

      {/* Confidence threshold */}
      <div>
        <label className="label">{t('confidenceThreshold')}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="flex-1 accent-blue-600"
          />
          <span className="w-12 text-right text-sm font-medium text-gray-700">
            {Math.round(parseFloat(threshold) * 100)}%
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-400">{t('confidenceThresholdHint')}</p>
      </div>

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? (
          <span className="flex items-center gap-2">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            {tCommon('saving')}
          </span>
        ) : (
          tCommon('save')
        )}
      </button>
    </form>
  );
}
