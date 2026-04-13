import type { Metadata } from 'next';
import Link from 'next/link';
import { OrdonnanceUploader } from '@/components/prescriptions/OrdonnanceUploader';

export const metadata: Metadata = { title: 'Nouvelle ordonnance' };

export default function NouvellePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {/* Back link */}
      <Link
        href="/ordonnances"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 19l-7-7 7-7" />
        </svg>
        Ordonnances
      </Link>

      <div className="card p-6">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">
          Nouvelle ordonnance
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Déposez ou sélectionnez la photo ou le scan de l&apos;ordonnance.
          RxMatch extraira automatiquement les articles.
        </p>

        <OrdonnanceUploader />
      </div>
    </div>
  );
}
