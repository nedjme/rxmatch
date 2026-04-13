'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Actor {
  email:     string;
  full_name: string | null;
}

interface AuditEvent {
  id:          string;
  action:      string;
  entity_type: string;
  entity_id:   string;
  payload:     Record<string, unknown>;
  ip_address:  string | null;
  created_at:  string;
  user_id:     string;
  actor:       Actor;
}

interface MemberOption {
  user_id:   string;
  email:     string;
  full_name: string | null;
}

interface JournalResponse {
  events:  AuditEvent[];
  total:   number;
  page:    number;
  members: MemberOption[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// All possible actions — used to populate filter dropdown
const ALL_ACTIONS = [
  'prescription.uploaded',
  'prescription.committed',
  'prescription_item.confirmed',
  'prescription_item.overridden',
  'catalogue.imported',
  'catalogue_item.created',
  'catalogue_item.updated',
  'catalogue_item.deleted',
  'member.invited',
  'member.role_changed',
  'member.removed',
  'org.settings_updated',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/** Colour coding per action category */
function actionBadgeClass(action: string): string {
  if (action.startsWith('prescription'))    return 'bg-blue-50 text-blue-700';
  if (action.startsWith('catalogue'))       return 'bg-emerald-50 text-emerald-700';
  if (action.startsWith('member'))          return 'bg-purple-50 text-purple-700';
  if (action.startsWith('org'))             return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

/** Compact payload summary shown in the table */
function payloadSummary(action: string, payload: Record<string, unknown>): string {
  if (action === 'prescription.uploaded') {
    const count = payload.item_count as number | undefined;
    return count !== undefined ? `${count} article${count !== 1 ? 's' : ''} extrait${count !== 1 ? 's' : ''}` : '';
  }
  if (action === 'catalogue.imported') {
    const { added, updated, skipped } = payload as { added?: number; updated?: number; skipped?: number };
    return [
      added   !== undefined ? `${added} ajouté${added   !== 1 ? 's' : ''}` : null,
      updated !== undefined ? `${updated} mis à jour`                        : null,
      skipped !== undefined ? `${skipped} ignoré${skipped !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(', ');
  }
  if (action === 'catalogue_item.created' || action === 'catalogue_item.updated' || action === 'catalogue_item.deleted') {
    return (payload.name as string | undefined) ?? '';
  }
  if (action === 'member.invited') {
    return (payload.email as string | undefined) ?? '';
  }
  if (action === 'member.role_changed') {
    return `→ ${payload.new_role as string | undefined ?? ''}`;
  }
  if (action === 'prescription_item.confirmed' || action === 'prescription_item.overridden') {
    return (payload.confirmed_item_name as string | undefined) ?? '';
  }
  return '';
}

// ── Payload detail panel ──────────────────────────────────────────────────────

function PayloadPanel({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const t = useTranslations('journal');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${actionBadgeClass(event.action)}`}>
              {event.action}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('columns.date')}</dt>
              <dd className="mt-0.5 text-gray-700">
                {new Date(event.created_at).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('columns.user')}</dt>
              <dd className="mt-0.5 text-gray-700">
                {event.actor.full_name
                  ? <><span className="font-medium">{event.actor.full_name}</span><br /><span className="text-xs text-gray-400">{event.actor.email}</span></>
                  : event.actor.email
                }
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('columns.entity')}</dt>
              <dd className="mt-0.5 text-gray-700 font-mono text-xs">{event.entity_type} / {event.entity_id}</dd>
            </div>
            {event.ip_address && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">IP</dt>
                <dd className="mt-0.5 text-gray-700 font-mono text-xs">{event.ip_address}</dd>
              </div>
            )}
          </dl>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Payload</p>
            <pre className="overflow-x-auto rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-700 border border-gray-200">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function JournalPage() {
  const t = useTranslations('journal');

  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [members,    setMembers]    = useState<MemberOption[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter,   setUserFilter]   = useState('');
  const [detailEvent,  setDetailEvent]  = useState<AuditEvent | null>(null);

  const fetchEvents = useCallback(async (
    action: string, userId: string, pg: number,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (action) params.set('action',  action);
      if (userId) params.set('user_id', userId);

      const res  = await fetch(`/api/org/journal?${params}`);
      const data = await res.json() as JournalResponse;

      setEvents(data.events ?? []);
      setTotal(data.total   ?? 0);
      if (pg === 0) setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(actionFilter, userFilter, page);
  }, [actionFilter, userFilter, page, fetchEvents]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          {total > 0 && (
            <p className="mt-0.5 text-sm text-gray-400">
              {total.toLocaleString('fr-FR')} événement{total !== 1 ? 's' : ''}
            </p>
          )}

          {/* Filters */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              className="input-base sm:max-w-xs"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            >
              <option value="">{t('allActions')}</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{t(`actions.${a}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>

            <select
              className="input-base sm:max-w-xs"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(0); }}
            >
              <option value="">{t('allUsers')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ? `${m.full_name} (${m.email})` : m.email}
                </option>
              ))}
            </select>

            {(actionFilter || userFilter) && (
              <button
                type="button"
                onClick={() => { setActionFilter(''); setUserFilter(''); setPage(0); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors self-start"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <SpinnerIcon className="h-7 w-7 animate-spin text-gray-300" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
              <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <p className="text-sm text-gray-400">{t('empty')}</p>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <table className="hidden md:table w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-40">{t('columns.date')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-48">{t('columns.user')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('columns.action')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Détail</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {events.map((event) => (
                    <tr key={event.id} className="group hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetailEvent(event)}>
                      <td className="px-6 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                        {new Date(event.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 max-w-[12rem]">
                        <p className="truncate text-xs font-medium text-gray-900" title={event.actor.full_name ?? event.actor.email}>
                          {event.actor.full_name ?? event.actor.email}
                        </p>
                        {event.actor.full_name && <p className="truncate text-xs text-gray-400">{event.actor.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeClass(event.action)}`}>
                          {t(`actions.${event.action}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                        <span className="truncate block">{payloadSummary(event.action, event.payload)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <svg className="h-4 w-4 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Mobile cards ── */}
              <div className="md:hidden divide-y divide-gray-100 bg-white">
                {events.map((event) => {
                  const summary = payloadSummary(event.action, event.payload);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className="w-full text-left px-4 py-3 active:bg-gray-50 transition-colors"
                      onClick={() => setDetailEvent(event)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClass(event.action)}`}>
                          {t(`actions.${event.action}` as Parameters<typeof t>[0])}
                        </span>
                        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap flex-shrink-0">
                          {new Date(event.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {event.actor.full_name ?? event.actor.email}
                      </p>
                      {summary && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 sm:px-6 py-3 text-sm text-gray-500">
            <span>Page {page + 1} / {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary py-1"
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary py-1"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailEvent && (
        <PayloadPanel
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
        />
      )}
    </>
  );
}
