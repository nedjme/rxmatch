'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ImageViewerProps {
  imageUrl:    string;
  legibility:  'good' | 'partial' | 'poor';
  language:    string;
  handwritten: boolean;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN  = 1;
const ZOOM_MAX  = 3;

function LegibilityBadge({ legibility }: { legibility: string }) {
  const t = useTranslations('prescriptions.review.legibility');

  const map: Record<string, { label: string; className: string }> = {
    good:    { label: t('good'),    className: 'bg-green-100 text-green-700' },
    partial: { label: t('partial'), className: 'bg-amber-100 text-amber-700' },
    poor:    { label: t('poor'),    className: 'bg-red-100 text-red-700' },
  };

  const { label, className } = map[legibility] ?? map.good;

  return <span className={`badge ${className}`}>{label}</span>;
}

function LanguageBadge({ language }: { language: string }) {
  const t = useTranslations('prescriptions.review.language');

  const labels: Record<string, string> = {
    fr:    t('fr'),
    ar:    t('ar'),
    en:    t('en'),
    other: t('other'),
  };

  return (
    <span className="badge bg-gray-100 text-gray-600">
      {labels[language] ?? labels.other}
    </span>
  );
}

export function ImageViewer({
  imageUrl,
  legibility,
  language,
  handwritten,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <LegibilityBadge legibility={legibility} />
          <LanguageBadge language={language} />
          {handwritten && (
            <span className="badge bg-purple-100 text-purple-700">Manuscrite</span>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            aria-label="Dézoomer"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-gray-500 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            aria-label="Zoomer"
          >
            +
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="ml-1 text-xs text-blue-600 hover:text-blue-700"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 overflow-auto bg-gray-900 flex items-start justify-center p-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Ordonnance"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="max-w-full rounded shadow-lg transition-transform duration-150"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500 mt-20">
            <svg className="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Image non disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}
