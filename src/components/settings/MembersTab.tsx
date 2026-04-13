'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id:         string;
  user_id:    string;
  role:       string;
  created_at: string;
  email:      string;
  full_name:  string | null;
}

interface InviteResult {
  id:         string;
  email:      string;
  role:       string;
  invite_url: string;
  expires_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrateur',
  pharmacist: 'Pharmacien',
  lab_tech:   'Technicien de laboratoire',
  readonly:   'Lecture seule',
};

const ROLE_COLORS: Record<string, string> = {
  admin:      'bg-purple-50 text-purple-700',
  pharmacist: 'bg-blue-50 text-blue-700',
  lab_tech:   'bg-emerald-50 text-emerald-700',
  readonly:   'bg-gray-100 text-gray-600',
};

// ── Invite modal ──────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose:  () => void;
  onInvited: (result: InviteResult) => void;
}

function InviteModal({ onClose, onInvited }: InviteModalProps) {
  const t       = useTranslations('settings.members');
  const tCommon = useTranslations('common');

  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('pharmacist');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res  = await fetch('/api/org/members', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    const data = await res.json() as InviteResult & { error?: string };

    if (!res.ok) {
      const msgs: Record<string, string> = {
        already_member: 'Cet utilisateur est déjà membre de l\'organisation.',
        missing_email:  'L\'adresse e-mail est requise.',
        invalid_role:   'Rôle invalide.',
      };
      setError(msgs[data.error ?? ''] ?? tCommon('error'));
      setSaving(false);
      return;
    }

    onInvited(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{t('invite')}</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label">{t('inviteEmail')}</label>
            <input
              ref={emailRef}
              type="email"
              className="input-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="utilisateur@exemple.fr"
              required
            />
          </div>

          <div>
            <label className="label">{t('inviteRole')}</label>
            <select
              className="input-base"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
              {tCommon('cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Envoi...
                </span>
              ) : (
                tCommon('invite')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invite link modal (shown after successful invite) ─────────────────────────

function InviteLinkModal({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(result.invite_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Invitation créée</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Partagez ce lien avec <span className="font-medium">{result.email}</span>.
              Il expire le {new Date(result.expires_at).toLocaleDateString('fr-FR')}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="flex-1 truncate text-xs text-gray-600 font-mono">{result.invite_url}</p>
          <button
            type="button"
            onClick={handleCopy}
            className={`flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Remove confirm ────────────────────────────────────────────────────────────

function RemoveConfirm({ member, onClose, onRemoved }: {
  member:    Member;
  onClose:   () => void;
  onRemoved: (id: string) => void;
}) {
  const tCommon  = useTranslations('common');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleRemove() {
    setLoading(true);
    const res = await fetch(`/api/org/members/${member.id}`, { method: 'DELETE' });
    if (res.ok) {
      onRemoved(member.id);
    } else {
      toast.error(tCommon('error'));
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Retirer le membre</h2>
        <p className="text-sm text-gray-600 mb-6">
          Êtes-vous sûr de vouloir retirer{' '}
          <span className="font-medium text-gray-900">
            {member.full_name || member.email}
          </span>{' '}
          de l&apos;organisation ?
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
            {tCommon('cancel')}
          </button>
          <button type="button" onClick={handleRemove} className="btn-danger" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Retrait...
              </span>
            ) : (
              'Retirer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────

export function MembersTab() {
  const t       = useTranslations('settings.members');
  const tCommon = useTranslations('common');

  const [members,       setMembers]       = useState<Member[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showInvite,    setShowInvite]    = useState(false);
  const [inviteResult,  setInviteResult]  = useState<InviteResult | null>(null);
  const [removeTarget,  setRemoveTarget]  = useState<Member | null>(null);
  const [savingRole,    setSavingRole]    = useState<string | null>(null); // member id being updated

  useEffect(() => {
    fetch('/api/org/members')
      .then((r) => r.json())
      .then((data: Member[]) => setMembers(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(member: Member, newRole: string) {
    setSavingRole(member.id);
    const res = await fetch(`/api/org/members/${member.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role: newRole }),
    });
    setSavingRole(null);

    if (res.ok) {
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, role: newRole } : m));
      toast.success(t('roleChanged'));
    } else {
      toast.error(tCommon('error'));
    }
  }

  function handleInvited(result: InviteResult) {
    setShowInvite(false);
    setInviteResult(result);
    toast.success(t('inviteSuccess'));
  }

  function handleRemoved(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setRemoveTarget(null);
    toast.success(t('removeSuccess'));
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{t('title')} ({members.length})</h2>
          <button type="button" onClick={() => setShowInvite(true)} className="btn-primary">
            {tCommon('invite')}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('columns.name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('columns.role')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('columns.joinedAt')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {members.map((member) => (
                <tr key={member.id} className="group hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{member.full_name || <span className="text-gray-400 italic">Sans nom</span>}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value)}
                        disabled={savingRole === member.id}
                        className={`rounded-md border-0 py-1 pl-2 pr-7 text-xs font-medium ring-1 ring-inset transition-colors focus:ring-2 focus:ring-blue-500 ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'} ring-transparent`}
                      >
                        {Object.entries(ROLE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      {savingRole === member.id && (
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(member.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(member)}
                      title="Retirer"
                      className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite    && <InviteModal onClose={() => setShowInvite(false)} onInvited={handleInvited} />}
      {inviteResult  && <InviteLinkModal result={inviteResult} onClose={() => setInviteResult(null)} />}
      {removeTarget  && (
        <RemoveConfirm
          member={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onRemoved={handleRemoved}
        />
      )}
    </>
  );
}
