'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentPrescription {
  id:            string;
  status:        string;
  created_at:    string;
  uploader_name: string;
}

interface OnboardingStatus {
  catalogue_imported:      boolean;
  first_prescription_done: boolean;
}

interface DashboardStats {
  scans_this_month:         number;
  prescriptions_this_month: number;
  correction_rate:          number | null;
  avg_confidence:           number | null;
  recent_prescriptions:     RecentPrescription[];
  onboarding:               OnboardingStatus | null;
  role:                     string;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconScan({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
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

function IconTarget({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function IconConfidence({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.745 3.745 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('prescriptions.status');
  const classes: Record<string, string> = {
    en_attente: 'bg-amber-50 text-amber-700',
    en_cours:   'bg-blue-50 text-blue-700',
    validee:    'bg-green-50 text-green-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {t(status as Parameters<typeof t>[0])}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:    string;
  value:    string;
  icon:     React.ReactNode;
  iconBg:   string;
  sub?:     string;
}

function StatCard({ label, value, icon, iconBg, sub }: StatCardProps) {
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Onboarding checklist ──────────────────────────────────────────────────────

interface OnboardingStep {
  key:   string;
  label: string;
  done:  boolean;
  href?: string;
}

function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const t = useTranslations('dashboard.onboarding');
  const allDone = steps.every((s) => s.done);

  if (allDone) return null;

  return (
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('title')}</h2>
      <ul className="space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              step.done ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {step.done
                ? <IconCheck className="h-3.5 w-3.5 text-green-600" />
                : <span className="h-2 w-2 rounded-full bg-gray-300" />
              }
            </div>
            <span className={`text-sm flex-1 ${step.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
              {step.label}
            </span>
            {!step.done && step.href && (
              <Link href={step.href} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Commencer →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');

  const [stats,   setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((data: DashboardStats) => setStats(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinnerIcon className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-sm text-gray-400">{tCommon('error')}</div>
    );
  }

  const isAdmin = stats.role === 'admin';

  // ── Stat cards ──────────────────────────────────────────────────────────

  const statCards: StatCardProps[] = [
    {
      label:  t('stats.prescriptionsThisMonth'),
      value:  String(stats.prescriptions_this_month),
      icon:   <IconPrescription className="h-5 w-5 text-blue-600" />,
      iconBg: 'bg-blue-50',
    },
    {
      label:  t('stats.averageConfidence'),
      value:  stats.avg_confidence !== null ? `${stats.avg_confidence} %` : '—',
      icon:   <IconConfidence className="h-5 w-5 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      sub:    'sur les ordonnances validées ce mois',
    },
    {
      label:  t('stats.correctionRate'),
      value:  stats.correction_rate !== null ? `${stats.correction_rate} %` : '—',
      icon:   <IconTarget className="h-5 w-5 text-amber-600" />,
      iconBg: 'bg-amber-50',
      sub:    'de suggestions corrigées ce mois',
    },
    {
      label:  t('stats.scansRemaining'),
      value:  String(stats.scans_this_month),
      icon:   <IconScan className="h-5 w-5 text-purple-600" />,
      iconBg: 'bg-purple-50',
      sub:    'scans réalisés ce mois-ci',
    },
  ];

  // ── Onboarding steps ────────────────────────────────────────────────────

  const onboardingSteps: OnboardingStep[] = [
    {
      key:   'org',
      label: t('onboarding.orgCreated'),
      done:  true,
    },
    {
      key:   'catalogue',
      label: t('onboarding.catalogueImported'),
      done:  stats.onboarding?.catalogue_imported ?? false,
      href:  '/catalogue/importer',
    },
    {
      key:   'prescription',
      label: t('onboarding.firstPrescription'),
      done:  stats.onboarding?.first_prescription_done ?? false,
      href:  '/ordonnances/nouvelle',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
        <Link href="/ordonnances/nouvelle" className="btn-primary flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('newPrescription')}
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent prescriptions — takes 2/3 width */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">{t('recentPrescriptions')}</h2>
              <Link href="/ordonnances" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                {t('viewAll')}
              </Link>
            </div>

            {stats.recent_prescriptions.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                Aucune ordonnance pour le moment
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {stats.recent_prescriptions.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/ordonnances/${p.id}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <IconPrescription className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          Ordonnance
                        </p>
                        <p className="text-xs text-gray-400">
                          par {p.uploader_name} · {new Date(p.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Onboarding checklist — 1/3 width, admin only, hidden once all done */}
        {isAdmin && (
          <div>
            <OnboardingChecklist steps={onboardingSteps} />

            {/* Quick links when checklist is done */}
            {onboardingSteps.every((s) => s.done) && (
              <div className="card p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Raccourcis</h2>
                <nav className="space-y-1">
                  {[
                    { href: '/catalogue/importer', label: 'Importer un catalogue' },
                    { href: '/parametres',          label: 'Gérer les membres' },
                    { href: '/journal',             label: 'Voir le journal' },
                  ].map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      {label}
                      <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
