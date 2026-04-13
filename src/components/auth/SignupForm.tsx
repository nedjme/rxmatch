'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { signUp } from '@/actions/auth';
import type { AuthState } from '@/actions/auth';

const initialState: AuthState = { error: null };

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: é→e, à→a, etc.
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.signup');

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

export function SignupForm() {
  const t = useTranslations('auth.signup');
  const [state, formAction] = useActionState(signUp, initialState);

  const [orgName,    setOrgName]    = useState('');
  const [orgSlug,    setOrgSlug]    = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [password,   setPassword]   = useState('');
  const [pwConfirm,  setPwConfirm]  = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  // Auto-derive slug from org name unless user has manually edited it
  useEffect(() => {
    if (!slugEdited) {
      setOrgSlug(slugify(orgName));
    }
  }, [orgName, slugEdited]);

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true);
    setOrgSlug(e.target.value);
  }

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
    if (orgSlug && !SLUG_RE.test(orgSlug)) {
      setClientError('invalidSlug');
      return;
    }

    formAction(formData);
  }

  const serverError = state.error;
  const displayError = clientError ?? serverError;

  const errorMessage = displayError
    ? (t.has(`errors.${displayError}` as Parameters<typeof t>[0]) ? t(`errors.${displayError}` as Parameters<typeof t>[0]) : t('errors.unknown'))
    : null;

  return (
    <form action={handleSubmit} className="space-y-5">
      {errorMessage && (
        <div className="rounded-lg bg-red-500/20 border border-red-400/30 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {/* Personal info */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">
          {t('accountSection')}
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="full_name" className="label-dark">{t('fullName')}</label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              required
              placeholder={t('fullNamePlaceholder')}
              className="input-dark"
            />
          </div>

          <div>
            <label htmlFor="email" className="label-dark">{t('email')}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder={t('emailPlaceholder')}
              className="input-dark"
            />
          </div>

          <div>
            <label htmlFor="password" className="label-dark">{t('password')}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder={t('passwordPlaceholder')}
              className="input-dark"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password_confirm" className="label-dark">{t('passwordConfirm')}</label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              autoComplete="new-password"
              required
              placeholder={t('passwordConfirmPlaceholder')}
              className={`input-dark ${
                pwConfirm && password !== pwConfirm ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400/20' : ''
              }`}
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Organisation */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">
          {t('orgSection')}
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="org_name" className="label-dark">{t('orgName')}</label>
            <input
              id="org_name"
              name="org_name"
              type="text"
              required
              placeholder={t('orgNamePlaceholder')}
              className="input-dark"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="org_slug" className="label-dark">{t('orgSlug')}</label>
            <div className="relative">
              <input
                id="org_slug"
                name="org_slug"
                type="text"
                required
                pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]|[a-z0-9]"
                className="input-dark pr-16 font-mono text-xs text-teal-300"
                value={orgSlug}
                onChange={handleSlugChange}
              />
              {orgSlug && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 select-none">
                  .rxmatch
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-white/40">{t('orgSlugHint')}</p>
          </div>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
