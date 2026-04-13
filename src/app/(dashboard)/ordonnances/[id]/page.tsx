import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchCatalogueItems } from '@/lib/matching';
import { ReviewScreen } from '@/components/prescriptions/ReviewScreen';
import type { ExtractionResult, PrescriptionItemWithSuggestions } from '@/types/extraction';

export const metadata: Metadata = { title: 'Révision de l\'ordonnance' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // ── Membership ───────────────────────────────────────────────────────────

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) redirect('/login');

  // ── Prescription ─────────────────────────────────────────────────────────

  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('id, status, image_url, raw_extraction, created_at')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single();

  if (!prescription) notFound();

  // ── Prescription items ────────────────────────────────────────────────────

  const { data: items } = await supabase
    .from('prescription_items')
    .select('*')
    .eq('prescription_id', id)
    .order('created_at', { ascending: true });

  // ── Catalogue suggestions (re-run matching) ───────────────────────────────

  const adminSupabase = createAdminClient();

  const suggestions = await Promise.all(
    (items ?? []).map((item) =>
      matchCatalogueItems(
        adminSupabase,
        membership.org_id,
        item.extracted_name,
        undefined,
        undefined,
      ),
    ),
  );

  const itemsWithSuggestions: PrescriptionItemWithSuggestions[] = (items ?? []).map(
    (item, i) => ({ ...item, suggestions: suggestions[i] ?? [] }),
  );

  // ── Signed image URL (1-hour expiry) ──────────────────────────────────────

  const { data: signedUrlData } = await adminSupabase.storage
    .from('prescriptions')
    .createSignedUrl(prescription.image_url, 3600);

  const imageUrl = signedUrlData?.signedUrl ?? '';

  // ── Extraction metadata ───────────────────────────────────────────────────

  const extraction = prescription.raw_extraction as ExtractionResult | null;

  return (
    <ReviewScreen
      prescription={{
        id:               prescription.id,
        status:           prescription.status as 'en_attente' | 'en_cours' | 'validee',
        createdAt:        prescription.created_at,
        legibility:       extraction?.legibility       ?? 'good',
        language:         extraction?.language         ?? 'fr',
        handwritten:      extraction?.handwritten      ?? false,
        patientName:      extraction?.patient_name     ?? null,
        doctorName:       extraction?.doctor_name      ?? null,
        prescriptionDate: extraction?.prescription_date ?? null,
      }}
      items={itemsWithSuggestions}
      imageUrl={imageUrl}
    />
  );
}
