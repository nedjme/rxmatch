'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { acceptInvite } from '@/actions/auth';
import type { AuthState } from '@/actions/auth';

const initialState: AuthState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.invite');

  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('submitting')}
        </span>
      ) : (
        t('submit')
      )}
    </button>
  );
}

export function InviteForm({ token }: { token: string }) {
  const t = useTranslations('auth.invite');
  const [state, formAction] = useActionState(acceptInvite, initialState);

  const [password,  setPassword]  = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setClientError(null);

    if (password.length < 8) {
      setClientError('passwordTooShort');
      return;
    }
    if (password !== pwConfirm) {
      setClientError('passwordMismatch');
      return;
    }

    formAction(formData);
  }

  const displayError = clientError ?? state.error;
  const errorMessage = displayError
    ? (t.has(`errors.${displayError}` as Parameters<typeof t>[0]) ? t(`errors.${displayError}` as Parameters<typeof t>[0]) : t('errors.unknown'))
    : null;

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="label">{t('fullName')}</label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          placeholder={t('fullNamePlaceholder')}
          className="input-base"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">{t('password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder={t('passwordPlaceholder')}
          className="input-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password_confirm" className="label">{t('passwordConfirm')}</label>
        <input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          className={`input-base ${
            pwConfirm && password !== pwConfirm
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : ''
          }`}
          value={pwConfirm}
          onChange={(e) => setPwConfirm(e.target.value)}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
