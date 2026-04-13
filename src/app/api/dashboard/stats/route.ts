import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrgMember } from '@/lib/api';

// ── GET /api/dashboard/stats ──────────────────────────────────────────────────
//
// Returns:
//   scans_this_month       — from scan_usage
//   prescriptions_this_month — count of prescriptions created this calendar month
//   correction_rate        — % of prescription_items with was_overridden=true (this month)
//   avg_confidence         — average match_score across validated items (this month)
//   recent_prescriptions   — last 5 prescriptions with uploader name
//   onboarding             — { catalogue_imported, first_prescription_done }

export async function GET() {
  const auth = await requireOrgMember();
  if (!auth.ok) return auth.response;
  const { orgId, role } = auth.data;

  const adminSupabase = createAdminClient();

  const now        = new Date();
  const year       = now.getFullYear();
  const month      = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd   = new Date(year, month, 1).toISOString();

  // ── Run queries in parallel ───────────────────────────────────────────────

  const [
    { data: scanRow },
    { count: presCount },
    { data: items },
    { data: recentPres },
    { data: onboarding },
  ] = await Promise.all([
    // Scans this month
    adminSupabase
      .from('scan_usage')
      .select('scan_count')
      .eq('org_id', orgId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),

    // Prescriptions this month (count only)
    adminSupabase
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd),

    // Items validated this month — for correction rate + avg confidence
    adminSupabase
      .from('prescription_items')
      .select('was_overridden, match_score, prescription_id, prescriptions!inner(org_id, created_at, status)')
      .eq('prescriptions.org_id', orgId)
      .eq('prescriptions.status', 'validee')
      .gte('prescriptions.created_at', monthStart)
      .lt('prescriptions.created_at', monthEnd),

    // Recent prescriptions
    adminSupabase
      .from('prescriptions')
      .select('id, status, created_at, uploaded_by')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),

    // Onboarding status (available to all roles)
    adminSupabase.rpc('get_onboarding_status', { p_org_id: orgId }),
  ]);

  // ── Compute metrics ───────────────────────────────────────────────────────

  const scansThisMonth        = scanRow?.scan_count ?? 0;
  const prescriptionsThisMonth = presCount ?? 0;

  const validatedItems = items ?? [];
  const totalItems     = validatedItems.length;
  const overridden     = validatedItems.filter((i) => i.was_overridden).length;
  const correctionRate = totalItems > 0 ? Math.round((overridden / totalItems) * 100) : null;

  const scoresWithValues = validatedItems
    .map((i) => i.match_score as number | null)
    .filter((s): s is number => s !== null);
  const avgConfidence = scoresWithValues.length > 0
    ? Math.round((scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length) * 100)
    : null;

  // ── Enrich recent prescriptions with uploader name ────────────────────────

  const uploaderIds = [...new Set((recentPres ?? []).map((p) => p.uploaded_by))];
  const uploaderMap = new Map<string, string>();

  await Promise.all(
    uploaderIds.map(async (uid) => {
      const { data } = await adminSupabase.auth.admin.getUserById(uid);
      const name = data?.user?.user_metadata?.full_name ?? data?.user?.email ?? uid;
      uploaderMap.set(uid, name);
    }),
  );

  const recent = (recentPres ?? []).map((p) => ({
    id:           p.id,
    status:       p.status,
    created_at:   p.created_at,
    uploader_name: uploaderMap.get(p.uploaded_by) ?? '',
  }));

  // ── Onboarding ────────────────────────────────────────────────────────────

  const onboardingRow = (onboarding as { catalogue_imported: boolean; first_prescription_done: boolean }[] | null)?.[0] ?? null;

  return NextResponse.json({
    scans_this_month:         scansThisMonth,
    prescriptions_this_month: prescriptionsThisMonth,
    correction_rate:          correctionRate,
    avg_confidence:            avgConfidence,
    recent_prescriptions:     recent,
    onboarding:               onboardingRow,
    role,
  });
}
