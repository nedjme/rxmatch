import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { InviteForm } from '@/components/auth/InviteForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.invite');
  return { title: t('title') };
}

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const t = await getTranslations('auth.invite');

  const adminSupabase = createAdminClient();

  const { data: invitation } = await adminSupabase
    .from('invitations')
    .select('id, email, role, org_id, expires_at, accepted_at, organizations(name)')
    .eq('token', token)
    .maybeSingle();

  const isValid =
    invitation &&
    !invitation.accepted_at &&
    new Date(invitation.expires_at) > new Date();

  if (!isValid) {
    return (
      <>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{t('invalid.title')}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('invalid.description')}</p>
          <a href="/login" className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
            Retour à la connexion
          </a>
        </div>
      </>
    );
  }

  const orgName = (invitation.organizations as unknown as { name: string } | null)?.name ?? '';
  const roleLabels: Record<string, string> = {
    admin:      'Administrateur',
    pharmacist: 'Pharmacien',
    lab_tech:   'Technicien de laboratoire',
    readonly:   'Lecture seule',
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{t('title')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('subtitleWithOrg', { orgName })}
        </p>
      </div>

      {/* Invitation summary */}
      <div className="mb-5 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Email</span>
          <span className="font-medium text-gray-900">{invitation.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">{t('roleLabel')}</span>
          <span className="font-medium text-gray-900">{roleLabels[invitation.role] ?? invitation.role}</span>
        </div>
      </div>

      <InviteForm token={token} />
    </>
  );
}
