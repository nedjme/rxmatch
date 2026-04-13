/**
 * Shared helpers for Next.js API route handlers.
 *
 * Every route that needs an authenticated org member calls requireOrgMember()
 * at the top, then accesses auth.data.userId / orgId / role.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface OrgMembership {
  userId: string;
  orgId:  string;
  role:   string;
}

type AuthResult =
  | { ok: true;  data: OrgMembership }
  | { ok: false; response: NextResponse };

const ALL_ROLES = ['admin', 'pharmacist', 'lab_tech', 'readonly'] as const;

/**
 * Verifies the request is from an authenticated user who belongs to an org
 * with one of the `allowedRoles`. Returns a typed error response on failure.
 *
 * Usage:
 * ```ts
 * const auth = await requireOrgMember(['admin', 'pharmacist']);
 * if (!auth.ok) return auth.response;
 * const { userId, orgId, role } = auth.data;
 * ```
 */
export async function requireOrgMember(
  allowedRoles: readonly string[] = ALL_ROLES,
): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership || !allowedRoles.includes(membership.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    data: {
      userId: user.id,
      orgId:  membership.org_id,
      role:   membership.role,
    },
  };
}

/**
 * Extracts the client IP address from common proxy headers.
 */
export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  );
}
