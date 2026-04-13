'use client';

import {
  useCallback,
  useRef,
  useState,
  useEffect,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type UploaderState =
  | { phase: 'idle' }
  | { phase: 'selected'; file: File; preview: string }
  | { phase: 'uploading'; file: File; preview: string }
  | { phase: 'error'; file: File; preview: string; code: string };

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES      = 10 * 1024 * 1024;

function formatBytes(n: number) {
  return n < 1024 * 1024
    ? `${(n / 1024).toFixed(0)} Ko`
    : `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

function isAccepted(file: File) {
  return ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_BYTES;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function OrdonnanceUploader() {
  const router = useRouter();
  const t      = useTranslations('prescriptions.upload');
  const tCommon = useTranslations('common');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState]     = useState<UploaderState>({ phase: 'idle' });
  const [dragOver, setDragOver] = useState(false);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (state.phase !== 'idle') {
        URL.revokeObjectURL(state.preview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File selection ──────────────────────────────────────────────────────

  const selectFile = useCallback((file: File) => {
    if (!isAccepted(file)) return;
    // Revoke previous preview if any
    if (state.phase !== 'idle') URL.revokeObjectURL(state.preview);
    setState({ phase: 'selected', file, preview: URL.createObjectURL(file) });
  }, [state]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  }, [selectFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  }, [selectFile]);

  // ── Upload ──────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (state.phase !== 'selected' && state.phase !== 'error') return;
    const { file, preview } = state;

    setState({ phase: 'uploading', file, preview });

    const body = new FormData();
    body.append('image', file);

    try {
      const res  = await fetch('/api/prescriptions/extract', { method: 'POST', body });
      const data = await res.json() as { prescription_id?: string; error?: string };

      if (!res.ok) {
        setState({ phase: 'error', file, preview, code: data.error ?? 'unknown' });
        return;
      }

      // Navigate to review screen — blob URL is no longer needed
      URL.revokeObjectURL(preview);
      router.push(`/ordonnances/${data.prescription_id}`);
    } catch {
      setState({ phase: 'error', file, preview, code: 'network_error' });
    }
  }

  // ── Error label map ─────────────────────────────────────────────────────

  const errorMessages: Record<string, string> = {
    invalid_file_type: 'Format de fichier non supporté.',
    file_too_large:    `Fichier trop volumineux (max ${formatBytes(MAX_BYTES)}).`,
    upload_failed:     'Erreur lors du téléversement. Veuillez réessayer.',
    claude_failed:     'Le service d\'analyse est temporairement indisponible.',
    parse_failed:      'La réponse du service d\'analyse est illisible.',
    network_error:     'Erreur réseau. Vérifiez votre connexion.',
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const isUploading = state.phase === 'uploading';

  if (state.phase === 'idle') {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Sélectionner une ordonnance"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors duration-150
          ${dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
      >
        <UploadIcon className="h-10 w-10 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-700">{t('hint')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('formats')}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={handleChange}
        />
      </div>
    );
  }

  const { file, preview } = state;

  return (
    <div className="space-y-4">
      {/* Preview card */}
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Aperçu de l'ordonnance"
          className={`w-full object-contain max-h-[420px] transition-opacity duration-300 ${
            isUploading ? 'opacity-40' : 'opacity-100'
          }`}
        />

        {/* Loading overlay */}
        {isUploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <SpinnerIcon className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm font-medium text-white drop-shadow">
              {t('processing')}
            </p>
          </div>
        )}

        {/* Replace button (top-right) */}
        {!isUploading && (
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(preview);
              setState({ phase: 'idle' });
            }}
            className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
            aria-label="Changer de fichier"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* File info */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="truncate max-w-[70%]">{file.name}</span>
        <span>{formatBytes(file.size)}</span>
      </div>

      {/* Error */}
      {state.phase === 'error' && (
        <WarningBanner
          message={errorMessages[state.code] ?? tCommon('error')}
        />
      )}

      {/* Action button */}
      <button
        type="button"
        disabled={isUploading}
        onClick={handleUpload}
        className="btn-primary w-full"
      >
        {isUploading ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon className="h-4 w-4 animate-spin" />
            {t('processing')}
          </span>
        ) : state.phase === 'error' ? (
          'Réessayer l\'analyse'
        ) : (
          'Analyser l\'ordonnance'
        )}
      </button>
    </div>
  );
}
