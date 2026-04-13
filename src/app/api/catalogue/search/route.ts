import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const q    = searchParams.get('q')?.trim() ?? '';
  const type = searchParams.get('type') || null;

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  const { data } = await supabase.rpc('search_catalogue_items', {
    p_org_id: membership.org_id,
    p_query:  q,
    p_type:   type,
    p_limit:  5,
  });

  return NextResponse.json(data ?? []);
}
