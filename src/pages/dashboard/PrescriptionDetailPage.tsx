import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Prescription, PrescriptionItemWithSuggestions } from '@/types';
import { matchCatalogueItems } from '@/lib/matching';
import ReviewScreen from '@/components/prescriptions/ReviewScreen';

export default function PrescriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [items, setItems] = useState<PrescriptionItemWithSuggestions[]>([]);
  const [loading, setLoading] = useState(true);
  const [reopening, setReopening] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!prescription?.image_url) return;
    supabase.storage
      .from('prescriptions')
      .createSignedUrl(prescription.image_url, 3600)
      .then(({ data }) => { if (data) setSignedUrl(data.signedUrl); });
  }, [prescription?.image_url]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: pres } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('id', id)
        .single();

      if (!pres) { navigate('/prescriptions'); return; }
      setPrescription(pres);

      const { data: rawItems } = await supabase
        .from('prescription_items')
        .select('*')
        .eq('prescription_id', id);

      const enriched = await Promise.all(
        (rawItems ?? []).map(async (item) => {
          const suggestions = await matchCatalogueItems(item.extracted_name);
          return { ...item, suggestions };
        }),
      );

      setItems(enriched);
      setLoading(false);
    })();
  }, [id, navigate]);

  async function handleReopen() {
    if (!prescription) return;
    setReopening(true);
    const { error } = await supabase
      .from('prescriptions')
      .update({ status: 'en_cours' })
      .eq('id', prescription.id);
    if (error) {
      toast.error('Erreur lors de la réouverture');
      setReopening(false);
      return;
    }
    setPrescription({ ...prescription, status: 'en_cours' });
    setReopening(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!prescription) return null;

  // Already validated — show read-only view with option to re-edit
  if (prescription.status === 'validee') {
    return (
      <div className="space-y-5">
        <button onClick={() => navigate('/prescriptions')} className="text-navy-400 hover:text-white text-sm">
          ← Ordonnances
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Ordonnance validée</h1>
            <span className="text-xs bg-teal-500/20 text-teal-400 px-2.5 py-1 rounded-full font-medium">Validée</span>
          </div>
          <button
            onClick={handleReopen}
            disabled={reopening}
            className="px-4 py-2 bg-navy-700 hover:bg-navy-600 border border-navy-600 text-navy-200 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {reopening ? 'Réouverture…' : 'Modifier'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="relative">
            {!signedUrl && (
              <div className="w-full aspect-[3/4] rounded-xl bg-navy-700 animate-pulse" />
            )}
            {signedUrl && (
              <ImageWithLoader src={signedUrl} className="rounded-xl border border-navy-700 w-full" alt="Ordonnance" />
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-navy-300 uppercase tracking-wider">Analyses confirmées</h2>
            {items.map((item) => (
              <div key={item.id} className="bg-navy-800 border border-navy-700 rounded-lg px-4 py-3">
                <div className="text-sm text-white">{item.extracted_name}</div>
                {item.matched_item_id && <MatchedItemName itemId={item.matched_item_id} />}
                {item.was_overridden && (
                  <span className="text-xs text-amber-400">Corrigé manuellement</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReviewScreen
      prescriptionId={prescription.id}
      imageUrl={prescription.image_url}
      items={items}
    />
  );
}

function ImageWithLoader({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded && <div className="w-full aspect-[3/4] rounded-xl bg-navy-700 animate-pulse" />}
      <img src={src} alt={alt} onLoad={() => setLoaded(true)} className={`${className} ${loaded ? '' : 'hidden'}`} />
    </div>
  );
}

function MatchedItemName({ itemId }: { itemId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from('catalogue_items')
      .select('name')
      .eq('id', itemId)
      .single()
      .then(({ data }) => setName(data?.name ?? null));
  }, [itemId]);
  return name ? <div className="text-xs text-teal-400 mt-0.5">→ {name}</div> : null;
}
