import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [t, { message }] = await Promise.all([
    getTranslations('auth.login'),
    searchParams,
  ]);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">{t('title')}</h2>
        <p className="text-sm text-navy-300 mt-1">{t('subtitle')}</p>
      </div>

      {message === 'check-email' && (
        <div className="mb-4 rounded-lg bg-teal-500/20 border border-teal-400/30 px-4 py-3 text-sm text-teal-200">
          Vérifiez votre boîte mail pour confirmer votre adresse e-mail avant de vous connecter.
        </div>
      )}

      <LoginForm />

      <p className="mt-6 text-center text-sm text-navy-300">
        {t('noAccount')}{' '}
        <a href="/signup" className="font-medium text-teal-400 hover:text-teal-300">
          {t('signupLink')}
        </a>
      </p>
    </>
  );
}
