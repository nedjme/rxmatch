'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportMode = 'add' | 'upsert' | 'replace';

interface ParsedFile {
  filename: string;
  headers:  string[];      // detected column headers
  rows:     string[][];    // raw rows (parallel to headers)
  preview:  string[][];    // first 5 rows for display
}

interface ColumnMapping {
  name:     string;  // which CSV column maps to name
  type:     string;  // which CSV column maps to type (may be '')
  code:     string;  // which CSV column maps to code (may be '')
  synonyms: string;  // which CSV column maps to synonyms (may be '')
}

type DefaultType = 'medicament' | 'analyse';

interface ImportResult {
  added:   number;
  updated: number;
  skipped: number;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <nav className="flex items-center gap-2">
      {labels.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              done   ? 'bg-blue-600 text-white' :
              active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' :
                       'bg-gray-100 text-gray-400'
            }`}>
              {done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-sm font-medium ${active ? 'text-gray-900' : done ? 'text-blue-600' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className={`mx-1 h-px w-8 ${i < current ? 'bg-blue-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Step 1: File drop zone ────────────────────────────────────────────────────

interface Step1Props {
  onParsed: (file: ParsedFile) => void;
}

function Step1({ onParsed }: Step1Props) {
  const t = useTranslations('catalogue.import_wizard');
  const [dragOver, setDragOver] = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    setError(null);
    setParsing(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

      let headers: string[] = [];
      let rows:    string[][] = [];

      if (ext === 'csv' || ext === 'txt') {
        // Parse CSV with PapaParse
        const text = await file.text();
        const result = Papa.parse<string[]>(text, {
          skipEmptyLines: true,
        });
        if (result.data.length === 0) throw new Error('empty');
        headers = (result.data[0] as string[]).map(String);
        rows    = (result.data.slice(1) as string[][]).map((r) =>
          headers.map((_, i) => String(r[i] ?? '')),
        );
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf       = await file.arrayBuffer();
        const workbook  = XLSX.read(buf, { type: 'array' });
        const sheet     = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData  = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
        if (jsonData.length === 0) throw new Error('empty');
        headers = (jsonData[0] as string[]).map(String);
        rows    = (jsonData.slice(1) as string[][]).map((r) =>
          headers.map((_, i) => String(r[i] ?? '')),
        );
      } else {
        throw new Error('unsupported');
      }

      if (headers.length === 0) throw new Error('no_headers');

      // Filter fully-empty rows
      rows = rows.filter((r) => r.some((c) => c.trim()));

      onParsed({
        filename: file.name,
        headers,
        rows,
        preview: rows.slice(0, 5),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(
        msg === 'empty'       ? 'Le fichier est vide.' :
        msg === 'unsupported' ? 'Format non supporté. Utilisez .csv ou .xlsx.' :
        msg === 'no_headers'  ? 'Aucune colonne détectée.' :
                                'Erreur lors de la lecture du fichier.',
      );
    } finally {
      setParsing(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-14 text-center transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50'
        }`}
      >
        {parsing ? (
          <SpinnerIcon className="h-10 w-10 animate-spin text-gray-300" />
        ) : (
          <>
            <IconUpload className="h-10 w-10 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t('dropzone')}</p>
              <p className="mt-1 text-xs text-gray-400">{t('dropzoneHint')}</p>
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Column mapping ────────────────────────────────────────────────────

interface Step2Props {
  parsed:      ParsedFile;
  mapping:     ColumnMapping;
  defaultType: DefaultType;
  onMapping:   (m: ColumnMapping) => void;
  onDefault:   (t: DefaultType) => void;
  onBack:      () => void;
  onNext:      () => void;
}

function Step2({ parsed, mapping, defaultType, onMapping, onDefault, onBack, onNext }: Step2Props) {
  const t = useTranslations('catalogue.import_wizard');
  const tCommon = useTranslations('common');

  const noCol = '— Aucune colonne —';
  const opts  = ['', ...parsed.headers];

  const fields: { key: keyof ColumnMapping; label: string; required?: boolean; hint?: string }[] = [
    { key: 'name',     label: t('columnMapping.name'),     required: true },
    { key: 'type',     label: t('columnMapping.type') },
    { key: 'code',     label: t('columnMapping.code') },
    { key: 'synonyms', label: t('columnMapping.synonyms'), hint: t('columnMapping.synonymsHint') },
  ];

  const canNext = mapping.name !== '';

  return (
    <div className="space-y-6">
      {/* Column selectors */}
      <div className="space-y-4">
        {fields.map(({ key, label, required, hint }) => (
          <div key={key}>
            <label className="label">
              {label}{' '}
              <span className="text-xs font-normal text-gray-400">
                {required ? t('columnMapping.nameRequired') : t('columnMapping.optional')}
              </span>
            </label>
            <select
              className="input-base"
              value={mapping[key]}
              onChange={(e) => onMapping({ ...mapping, [key]: e.target.value })}
            >
              {opts.map((h) => (
                <option key={h} value={h}>{h || noCol}</option>
              ))}
            </select>
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
          </div>
        ))}
      </div>

      {/* Default type when type column not mapped */}
      {!mapping.type && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
          <p className="text-sm text-gray-700">{t('columnMapping.defaultType')}</p>
          <div className="flex gap-4">
            {(['medicament', 'analyse'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="default_type"
                  value={v}
                  checked={defaultType === v}
                  onChange={() => onDefault(v)}
                  className="accent-blue-600"
                />
                <span className="text-sm text-gray-700">
                  {v === 'medicament' ? 'Médicaments' : 'Analyses'}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Preview table */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          {t('preview', { count: parsed.rows.length })}
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {parsed.headers.map((h) => (
                  <th key={h} className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parsed.preview.map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-700 max-w-[140px] truncate" title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nav */}
      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="btn-secondary">{tCommon('back')}</button>
        <button type="button" onClick={onNext} disabled={!canNext} className="btn-primary">
          {tCommon('next')}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Mode + confirm ────────────────────────────────────────────────────

interface Step3Props {
  parsed:      ParsedFile;
  mapping:     ColumnMapping;
  defaultType: DefaultType;
  onBack:      () => void;
  onDone:      (result: ImportResult) => void;
}

function Step3({ parsed, mapping, defaultType, onBack, onDone }: Step3Props) {
  const t = useTranslations('catalogue.import_wizard');
  const tCommon = useTranslations('common');

  const [mode,       setMode]       = useState<ImportMode>('upsert');
  const [importing,  setImporting]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Build summary counts from parsed rows
  const validRows = parsed.rows.filter((r) => {
    const nameIdx = parsed.headers.indexOf(mapping.name);
    return nameIdx >= 0 && r[nameIdx]?.trim();
  });
  const skipped = parsed.rows.length - validRows.length;

  async function handleImport() {
    setImporting(true);
    setError(null);

    // Map each row to ImportRow
    const nameIdx     = parsed.headers.indexOf(mapping.name);
    const typeIdx     = mapping.type     ? parsed.headers.indexOf(mapping.type)     : -1;
    const codeIdx     = mapping.code     ? parsed.headers.indexOf(mapping.code)     : -1;
    const synonymsIdx = mapping.synonyms ? parsed.headers.indexOf(mapping.synonyms) : -1;

    const rows = parsed.rows
      .filter((r) => r[nameIdx]?.trim())
      .map((r) => ({
        name:     r[nameIdx].trim(),
        type:     typeIdx     >= 0 ? r[typeIdx]?.trim()     : undefined,
        code:     codeIdx     >= 0 ? r[codeIdx]?.trim()     : undefined,
        synonyms: synonymsIdx >= 0 ? r[synonymsIdx]?.trim() : undefined,
      }));

    const column_mapping: Record<string, string> = {
      _filename: parsed.filename,
      name:      mapping.name,
    };
    if (mapping.type)     column_mapping.type     = mapping.type;
    if (mapping.code)     column_mapping.code     = mapping.code;
    if (mapping.synonyms) column_mapping.synonyms = mapping.synonyms;

    try {
      const res  = await fetch('/api/catalogue/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows, mode, column_mapping, default_type: defaultType }),
      });
      const data = await res.json() as ImportResult & { error?: string };

      if (!res.ok) {
        setError(data.error ?? tCommon('error'));
        setImporting(false);
        return;
      }

      onDone(data);
    } catch {
      setError('Erreur réseau. Veuillez réessayer.');
      setImporting(false);
    }
  }

  const modes: { value: ImportMode; label: string; description: string }[] = [
    {
      value:       'add',
      label:       t('modes.add'),
      description: 'Les articles dont le nom ou le code existe déjà seront ignorés.',
    },
    {
      value:       'upsert',
      label:       t('modes.upsert'),
      description: 'Les articles existants (par nom ou code) seront mis à jour.',
    },
    {
      value:       'replace',
      label:       t('modes.replace'),
      description: t('modes.replaceWarning'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="space-y-3">
        {modes.map((m) => (
          <label key={m.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
              mode === m.value
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
              className="mt-0.5 accent-blue-600"
            />
            <div>
              <p className={`text-sm font-medium ${mode === m.value ? 'text-blue-800' : 'text-gray-900'}`}>
                {m.label}
              </p>
              <p className={`mt-0.5 text-xs ${
                mode === m.value && m.value === 'replace'
                  ? 'text-red-600'
                  : mode === m.value
                  ? 'text-blue-600'
                  : 'text-gray-500'
              }`}>
                {m.description}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <p className="font-medium mb-2">Résumé de l&apos;import</p>
        <ul className="space-y-1 text-xs text-gray-600">
          <li>Fichier : <span className="font-medium">{parsed.filename}</span></li>
          <li>Lignes valides : <span className="font-medium text-blue-700">{validRows.length}</span></li>
          {skipped > 0 && (
            <li>Lignes ignorées (sans nom) : <span className="font-medium text-amber-600">{skipped}</span></li>
          )}
        </ul>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Nav */}
      <div className="flex justify-between">
        <button type="button" onClick={onBack} disabled={importing} className="btn-secondary">
          {tCommon('back')}
        </button>
        <button type="button" onClick={handleImport} disabled={importing || validRows.length === 0} className="btn-primary">
          {importing ? (
            <span className="flex items-center gap-2">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Import en cours...
            </span>
          ) : (
            t('confirm')
          )}
        </button>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <IconCheck className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Import terminé</h2>
        <p className="mt-1 text-sm text-gray-500">Le catalogue a été mis à jour avec succès.</p>
      </div>
      <div className="flex gap-8 rounded-xl border border-gray-200 bg-gray-50 px-8 py-4 text-center">
        <div>
          <p className="text-2xl font-bold text-blue-600">{result.added}</p>
          <p className="text-xs text-gray-500 mt-0.5">ajouté{result.added !== 1 ? 's' : ''}</p>
        </div>
        <div className="w-px bg-gray-200" />
        <div>
          <p className="text-2xl font-bold text-emerald-600">{result.updated}</p>
          <p className="text-xs text-gray-500 mt-0.5">mis à jour</p>
        </div>
        <div className="w-px bg-gray-200" />
        <div>
          <p className="text-2xl font-bold text-gray-400">{result.skipped}</p>
          <p className="text-xs text-gray-500 mt-0.5">ignoré{result.skipped !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onReset} className="btn-secondary">
          Importer un autre fichier
        </button>
        <button type="button" onClick={() => router.push('/catalogue')} className="btn-primary">
          Voir le catalogue
        </button>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function ImportWizard() {
  const t = useTranslations('catalogue.import_wizard');
  const router = useRouter();

  const [step,        setStep]        = useState(0);
  const [parsed,      setParsed]      = useState<ParsedFile | null>(null);
  const [mapping,     setMapping]     = useState<ColumnMapping>({ name: '', type: '', code: '', synonyms: '' });
  const [defaultType, setDefaultType] = useState<DefaultType>('medicament');
  const [result,      setResult]      = useState<ImportResult | null>(null);

  // Auto-detect obvious column mappings when a file is parsed
  function autoDetect(file: ParsedFile): ColumnMapping {
    const h   = file.headers.map((x) => x.toLowerCase());
    const find = (candidates: string[]) =>
      file.headers[h.findIndex((x) => candidates.some((c) => x.includes(c)))] ?? '';

    return {
      name:     find(['nom', 'name', 'libelle', 'libellé', 'designation', 'désignation']),
      type:     find(['type', 'categorie', 'catégorie', 'category']),
      code:     find(['code', 'ref', 'référence', 'reference', 'id']),
      synonyms: find(['synonyme', 'synonym', 'alias']),
    };
  }

  function handleParsed(file: ParsedFile) {
    setParsed(file);
    setMapping(autoDetect(file));
    setStep(1);
  }

  function handleDone(res: ImportResult) {
    setResult(res);
    setStep(3);
    toast.success(`Import terminé — ${res.added} ajouté${res.added !== 1 ? 's' : ''}`);
  }

  function handleReset() {
    setParsed(null);
    setMapping({ name: '', type: '', code: '', synonyms: '' });
    setDefaultType('medicament');
    setResult(null);
    setStep(0);
  }

  const stepLabels = [t('step1'), t('step2'), t('step3')];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back to catalogue */}
      <button
        type="button"
        onClick={() => router.push('/catalogue')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Catalogue
      </button>

      <div className="card p-6 sm:p-8">
        <h1 className="mb-6 text-lg font-semibold text-gray-900">{t('title')}</h1>

        {/* Step indicator — hide on success */}
        {step < 3 && (
          <div className="mb-8">
            <StepIndicator current={step} labels={stepLabels} />
          </div>
        )}

        {step === 0 && <Step1 onParsed={handleParsed} />}

        {step === 1 && parsed && (
          <Step2
            parsed={parsed}
            mapping={mapping}
            defaultType={defaultType}
            onMapping={setMapping}
            onDefault={setDefaultType}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && parsed && (
          <Step3
            parsed={parsed}
            mapping={mapping}
            defaultType={defaultType}
            onBack={() => setStep(1)}
            onDone={handleDone}
          />
        )}

        {step === 3 && result && (
          <SuccessScreen result={result} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}
