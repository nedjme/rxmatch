import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/components/auth/SignupForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signup');
  return { title: t('title') };
}

export default async function SignupPage() {
  const t = await getTranslations('auth.signup');

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">{t('title')}</h2>
        <p className="text-sm text-navy-300 mt-1">{t('subtitle')}</p>
      </div>

      <SignupForm />

      <p className="mt-6 text-center text-sm text-navy-300">
        {t('hasAccount')}{' '}
        <a href="/login" className="font-medium text-teal-400 hover:text-teal-300">
          {t('loginLink')}
        </a>
      </p>
    </>
  );
}
