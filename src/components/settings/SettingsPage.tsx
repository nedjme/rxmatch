'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrgTab }     from './OrgTab';
import { MembersTab } from './MembersTab';
import { UsageTab }   from './UsageTab';

type Tab = 'organisation' | 'members' | 'usage';

export function SettingsPage() {
  const t = useTranslations('settings');
  const [tab, setTab] = useState<Tab>('organisation');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'organisation', label: t('tabs.organisation') },
    { key: 'members',      label: t('tabs.members') },
    { key: 'usage',        label: t('tabs.usage') },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">{t('title')}</h1>

      {/* Tab bar */}
      <div className="mb-8 flex border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'organisation' && <OrgTab />}
      {tab === 'members'      && <MembersTab />}
      {tab === 'usage'        && <UsageTab />}
    </div>
  );
}
