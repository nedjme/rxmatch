'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface UsageRow {
  year:       number;
  month:      number;
  scan_count: number;
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const MONTH_NAMES = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

export function UsageTab() {
  const t = useTranslations('settings.usage');

  const [rows,    setRows]    = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/org/usage')
      .then((r) => r.json())
      .then((data: UsageRow[]) => setRows(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  const now       = new Date();
  const thisMonth = rows.find((r) => r.year === now.getFullYear() && r.month === now.getMonth() + 1);
  const maxCount  = Math.max(1, ...rows.map((r) => r.scan_count));

  // Display in chronological order for the bar chart
  const chronological = [...rows].reverse();

  return (
    <div className="space-y-8">
      {/* Current month stat */}
      <div className="flex items-center gap-4 rounded-xl border border-blue-100 bg-blue-50 px-6 py-5">
        <div>
          <p className="text-3xl font-bold text-blue-700">{thisMonth?.scan_count ?? 0}</p>
          <p className="text-sm text-blue-600 mt-0.5">
            {t('scans')} · {t('currentMonth')}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      {rows.length > 0 ? (
        <div>
          <p className="mb-4 text-sm font-semibold text-gray-700">{t('history')}</p>
          <div className="flex items-end gap-2 h-36">
            {chronological.map((row) => {
              const pct  = (row.scan_count / maxCount) * 100;
              const isCurrent = row.year === now.getFullYear() && row.month === now.getMonth() + 1;
              return (
                <div key={`${row.year}-${row.month}`} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium text-gray-500">{row.scan_count}</span>
                  <div
                    className={`w-full rounded-t-sm transition-all ${isCurrent ? 'bg-blue-500' : 'bg-blue-200'}`}
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${MONTH_NAMES[row.month - 1]} ${row.year} : ${row.scan_count} scans`}
                  />
                  <span className="text-xs text-gray-400">{MONTH_NAMES[row.month - 1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Aucune donnée d&apos;utilisation enregistrée.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('month')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('count')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row) => {
                const isCurrent = row.year === now.getFullYear() && row.month === now.getMonth() + 1;
                return (
                  <tr key={`${row.year}-${row.month}`} className={isCurrent ? 'bg-blue-50' : ''}>
                    <td className={`px-4 py-2.5 ${isCurrent ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                      {MONTH_NAMES[row.month - 1]} {row.year}
                      {isCurrent && <span className="ml-2 text-xs font-normal text-blue-400">ce mois-ci</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${isCurrent ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                      {row.scan_count.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
