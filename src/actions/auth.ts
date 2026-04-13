'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AuthState = {
  error: string | null;
};

// ── Sign in ──────────────────────────────────────────────────────────────────

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (
      error.message.toLowerCase().includes('invalid login') ||
      error.message.toLowerCase().includes('invalid credentials')
    ) {
      return { error: 'invalidCredentials' };
    }
    return { error: 'unknown' };
  }

  redirect('/dashboard');
}

// ── Sign up ──────────────────────────────────────────────────────────────────

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email    = formData.get('email')     as string;
  const password = formData.get('password')  as string;
  const fullName = formData.get('full_name') as string;
  const orgName  = formData.get('org_name')  as string;
  const orgSlug  = formData.get('org_slug')  as string;

  const supabase      = await createClient();
  const adminSupabase = createAdminClient();

  console.log('[signUp] env check — URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL, 'ANON:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'SERVICE:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Check slug availability
  const { data: existingOrg } = await adminSupabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (existingOrg) {
    return { error: 'slugTaken' };
  }

  // 2. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (authError) {
    console.error('[signUp] auth error:', authError.message);
    if (authError.message.toLowerCase().includes('already registered')) {
      return { error: 'emailTaken' };
    }
    return { error: 'unknown' };
  }

  if (!authData.user) {
    return { error: 'unknown' };
  }

  // 3. Create organization (service role — no INSERT policy for authenticated users)
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .insert({ name: orgName, slug: orgSlug })
    .select('id')
    .single();

  if (orgError || !org) {
    console.error('[signUp] org insert failed:', orgError?.code, orgError?.message, orgError?.details, orgError?.hint);
    // Roll back: delete the auth user so the email can be retried
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return { error: 'unknown' };
  }

  // 4. Add user as admin member
  const { error: memberError } = await adminSupabase
    .from('organization_members')
    .insert({ org_id: org.id, user_id: authData.user.id, role: 'admin' });

  if (memberError) {
    console.error('[signUp] member insert failed:', memberError.code, memberError.message, memberError.details, memberError.hint);
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    await adminSupabase.from('organizations').delete().eq('id', org.id);
    return { error: 'unknown' };
  }

  // Email confirmation required (production with confirmations enabled)
  if (!authData.session) {
    redirect('/login?message=check-email');
  }

  redirect('/dashboard');
}

// ── Accept invite ─────────────────────────────────────────────────────────────

export async function acceptInvite(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token    = formData.get('token')     as string;
  const password = formData.get('password')  as string;
  const fullName = formData.get('full_name') as string;

  const adminSupabase = createAdminClient();

  // 1. Look up the invitation
  const { data: invitation, error: invErr } = await adminSupabase
    .from('invitations')
    .select('*, organizations(name)')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (invErr || !invitation) {
    return { error: 'invalidInvite' };
  }

  // 2. Create auth user
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: invitation.email,
    password,
    user_metadata: { full_name: fullName },
    email_confirm: true,
  });

  if (authError || !authData.user) {
    if (authError?.message.toLowerCase().includes('already registered')) {
      return { error: 'emailTaken' };
    }
    return { error: 'unknown' };
  }

  // 3. Add member
  const { error: memberError } = await adminSupabase
    .from('organization_members')
    .insert({
      org_id:  invitation.org_id,
      user_id: authData.user.id,
      role:    invitation.role,
    });

  if (memberError) {
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return { error: 'unknown' };
  }

  // 4. Mark invitation accepted
  await adminSupabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // 5. Sign in the new user
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({
    email: invitation.email,
    password,
  });

  redirect('/dashboard');
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
