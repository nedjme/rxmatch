import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ShellLayout } from '@/components/layout/ShellLayout';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch membership + org in one query
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) redirect('/login');

  const org = membership.organizations as unknown as { id: string; name: string; slug: string };

  return (
    <ShellLayout
      orgId={org.id}
      orgName={org.name}
      userFullName={(user.user_metadata?.full_name as string | undefined) ?? ''}
      userEmail={user.email ?? ''}
      role={membership.role as string}
    >
      {children}
    </ShellLayout>
  );
}
