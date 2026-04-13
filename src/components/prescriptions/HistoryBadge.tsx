import { useTranslations } from 'next-intl';

interface HistoryBadgeProps {
  count: number;
}

export function HistoryBadge({ count }: HistoryBadgeProps) {
  const t = useTranslations('prescriptions.review');

  return (
    <span className="badge bg-teal-100 text-teal-700">
      {t('confirmedTimes', { count })}
    </span>
  );
}
