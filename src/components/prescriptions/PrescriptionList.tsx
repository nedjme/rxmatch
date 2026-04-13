'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prescription {
  id:            string;
  status:        'en_attente' | 'en_cours' | 'validee';
  created_at:    string;
  uploader_name: string;
  item_count:    number;
}

type StatusFilter = '' | 'en_attente' | 'en_cours' | 'validee';

// ── Icons ─────────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function IconPrescription({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('prescriptions.status');
  const classes: Record<string, string> = {
    en_attente: 'bg-amber-50 text-amber-700',
    en_cours:   'bg-blue-50 text-blue-700',
    validee:    'bg-green-50 text-green-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${classes[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {t(status as Parameters<typeof t>[0])}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function PrescriptionList() {
  const t = useTranslations('prescriptions');
  const tCommon = useTranslations('common');

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState(0);
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('');
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  const fetchPrescriptions = useCallback(async (status: StatusFilter, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (status) params.set('status', status);
      const res  = await fetch(`/api/prescriptions?${params}`);
      const data = await res.json() as { prescriptions: Prescription[]; total: number };
      setPrescriptions(data.prescriptions ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrescriptions(statusFilter, page);
  }, [statusFilter, page, fetchPrescriptions]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm('Supprimer cette ordonnance ? Cette action est irréversible.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/prescriptions/${id}`, { method: 'DELETE' });
      setPrescriptions((prev) => prev.filter((p) => p.id !== id));
      setTotal((prev) => prev - 1);
    } finally {
      setDeletingId(null);
    }
  }

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: '',           label: 'Toutes' },
    { value: 'en_attente', label: t('status.en_attente') },
    { value: 'en_cours',   label: t('status.en_cours') },
    { value: 'validee',    label: t('status.validee') },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            {total > 0 && (
              <p className="mt-0.5 text-sm text-gray-400">
                {total.toLocaleString('fr-FR')} ordonnance{total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <Link href="/ordonnances/nouvelle" className="btn-primary flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('new')}
          </Link>
        </div>

        {/* Status filter */}
        <div className="mt-4 flex rounded-lg border border-navy-200 overflow-hidden w-fit">
          {statusFilters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setStatusFilter(value); setPage(0); }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-teal-500 text-white'
                  : 'bg-white text-navy-600 hover:bg-teal-50 hover:text-teal-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <SpinnerIcon className="h-7 w-7 animate-spin text-gray-300" />
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <IconPrescription className="h-10 w-10 text-gray-200" />
            <p className="text-sm text-gray-400">{t('empty')}</p>
            <Link href="/ordonnances/nouvelle" className="btn-primary mt-1">
              {t('new')}
            </Link>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-44">
                  {t('columns.date')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Émetteur
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-28">
                  {t('columns.items')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-36">
                  {t('columns.status')}
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {prescriptions.map((p) => (
                <tr
                  key={p.id}
                  className="group hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/ordonnances/${p.id}`}
                >
                  <td className="px-6 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                    {new Date(p.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium max-w-xs">
                    <span className="truncate block" title={p.uploader_name}>{p.uploader_name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums">
                    {p.item_count} article{p.item_count !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={deletingId === p.id}
                        onClick={(e) => handleDelete(e, p.id)}
                        className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50"
                        title="Supprimer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <svg className="h-4 w-4 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3 text-sm text-gray-500">
          <span>Page {page + 1} / {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="btn-secondary py-1"
            >
              {tCommon('previous')}
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-secondary py-1"
            >
              {tCommon('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
