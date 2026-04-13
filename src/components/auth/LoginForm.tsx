'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { signIn } from '@/actions/auth';
import type { AuthState } from '@/actions/auth';

const initialState: AuthState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.login');

  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? (
        <span className="flex items-center gap-2">
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

export function LoginForm() {
  const t = useTranslations('auth.login');
  const [state, formAction] = useActionState(signIn, initialState);

  const errorMessage = state.error
    ? (t.has(`errors.${state.error}` as Parameters<typeof t>[0]) ? t(`errors.${state.error}` as Parameters<typeof t>[0]) : t('errors.unknown'))
    : null;

  return (
    <form action={formAction} className="space-y-4">
      {errorMessage && (
        <div className="rounded-lg bg-red-500/20 border border-red-400/30 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="email" className="label-dark">
          {t('email')}
        </label>
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
        <label htmlFor="password" className="label-dark">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input-dark"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
