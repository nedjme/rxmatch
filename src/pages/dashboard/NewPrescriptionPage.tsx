/**
 * NewPrescriptionPage — 3-step flow:
 *   1. Device picker (scanner / phone)
 *   2. Masking canvas (patient name redaction — always prompted)
 *   3. Upload masked image → Gemini extraction → ReviewScreen
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { extractPrescription } from '@/lib/gemini';
import { matchCatalogueItems } from '@/lib/matching';
import { savePrescriptionOriginal } from '@/lib/tauri';
import DevicePicker from '@/components/prescriptions/DevicePicker';
import MaskingCanvas from '@/components/prescriptions/MaskingCanvas';
import ReviewScreen from '@/components/prescriptions/ReviewScreen';
import type { PrescriptionItemWithSuggestions } from '@/types';

type Step = 'pick' | 'mask' | 'extracting' | 'review';

interface ReviewData {
  prescriptionId: string;
  imageUrl: string;
  items: PrescriptionItemWithSuggestions[];
}

const STORAGE_BUCKET = 'prescriptions';

export default function NewPrescriptionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('pick');
  const [rawImageFile, setRawImageFile] = useState<File | null>(null);
  const [extractProgress, setExtractProgress] = useState('');
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);

  // Step 1 → 2: device delivered an image
  function handleImageReceived(file: File) {
    setRawImageFile(file);
    setStep('mask');
  }

  // Step 2 → 3: masking confirmed, start extraction pipeline
  async function handleMaskConfirmed(maskedBlob: Blob, originalFile: File) {
    setStep('extracting');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      // ── Optionally save original to local filesystem ──────────────────────
      const { data: settings } = await supabase
        .from('user_settings')
        .select('local_save_enabled, local_save_folder')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settings?.local_save_enabled && settings.local_save_folder) {
        setExtractProgress('Sauvegarde de l\'original…');
        const bytes = new Uint8Array(await originalFile.arrayBuffer());
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const filename = `ordonnance_${Date.now()}.jpg`;
        await savePrescriptionOriginal({
          basePath: settings.local_save_folder,
          dateStr: today,
          filename,
          data: bytes,
        });
      }

      // ── Upload masked image to Supabase Storage ───────────────────────────
      setExtractProgress('Téléversement de l\'image masquée…');
      const ext = 'jpg';
      const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, maskedBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw new Error(`Erreur upload: ${uploadError.message}`);

      // ── Fetch decision history for context hints ──────────────────────────
      const { data: historyRows } = await supabase
        .from('decision_history')
        .select('extracted_name, matched_item_name, matched_item_code, confirmation_count')
        .order('confirmation_count', { ascending: false })
        .limit(30);

      // ── Gemini extraction ─────────────────────────────────────────────────
      setExtractProgress('Extraction avec l\'IA…');
      const maskedBytes = await maskedBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(maskedBytes).reduce((s, b) => s + String.fromCharCode(b), ''),
      );

      const { extraction } = await extractPrescription(
        base64,
        'image/jpeg',
        historyRows ?? [],
      );

      if (!Array.isArray(extraction.items)) extraction.items = [];

      // ── Catalogue matching ────────────────────────────────────────────────
      setExtractProgress('Recherche dans le catalogue…');
      const suggestions = await Promise.all(
        extraction.items.map((item) =>
          matchCatalogueItems(item.extracted_name, item.hint),
        ),
      );

      // ── Persist prescription in DB ────────────────────────────────────────
      setExtractProgress('Enregistrement…');
      const { data: prescription, error: presError } = await supabase
        .from('prescriptions')
        .insert({
          user_id:        user.id,
          image_url:      storagePath,
          raw_extraction: extraction as unknown as Record<string, unknown>,
          status:         'en_attente',
          masked:         true,
        })
        .select('id')
        .single();

      if (presError || !prescription) throw new Error('Erreur DB prescription');

      // ── Persist prescription items ────────────────────────────────────────
      const itemRows = extraction.items.map((item, i) => ({
        prescription_id:       prescription.id,
        extracted_name:        item.extracted_name,
        extraction_confidence: item.confidence,
        suggested_item_id:     suggestions[i]?.[0]?.id    ?? null,
        match_score:           suggestions[i]?.[0]?.score ?? null,
      }));

      const { data: savedItems, error: itemsError } = await supabase
        .from('prescription_items')
        .insert(itemRows)
        .select('*');

      if (itemsError) throw new Error('Erreur DB items');

      // ── Build review data ─────────────────────────────────────────────────
      const itemsWithSuggestions: PrescriptionItemWithSuggestions[] = (savedItems ?? []).map(
        (item, i) => ({ ...item, suggestions: suggestions[i] ?? [] }),
      );

      setReviewData({
        prescriptionId: prescription.id,
        imageUrl: storagePath,
        items: itemsWithSuggestions,
      });
      setStep('review');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erreur lors du traitement');
      setStep('mask');
      setExtractProgress('');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'review' && reviewData) {
    return (
      <ReviewScreen
        prescriptionId={reviewData.prescriptionId}
        imageUrl={reviewData.imageUrl}
        items={reviewData.items}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div>
        <button
          onClick={() => navigate('/prescriptions')}
          className="text-navy-400 hover:text-white text-sm"
        >
          ← Ordonnances
        </button>
        <h1 className="text-2xl font-bold text-white mt-2">Nouvelle ordonnance</h1>
      </div>

      <StepIndicator current={step} />

      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        {step === 'pick' && (
          <DevicePicker
            onImageReceived={handleImageReceived}
            onCancel={() => navigate('/prescriptions')}
          />
        )}

        {step === 'mask' && rawImageFile && (
          <MaskingCanvas
            imageFile={rawImageFile}
            onConfirm={handleMaskConfirmed}
          />
        )}

        {step === 'extracting' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-medium">{extractProgress || 'Traitement en cours…'}</p>
            <p className="text-navy-400 text-sm">Cela peut prendre quelques secondes</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { key: 'pick',       label: 'Appareil' },
    { key: 'mask',       label: 'Masquage' },
    { key: 'extracting', label: 'Extraction' },
    { key: 'review',     label: 'Révision' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${
            i < currentIdx  ? 'text-teal-400' :
            i === currentIdx ? 'text-white'   : 'text-navy-500'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              i < currentIdx   ? 'bg-teal-500 text-white' :
              i === currentIdx ? 'bg-navy-600 text-white ring-2 ring-teal-500' :
                                 'bg-navy-700 text-navy-500'
            }`}>
              {i < currentIdx ? '✓' : i + 1}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px ${i < currentIdx ? 'bg-teal-500' : 'bg-navy-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}
