import { useTranslations } from 'next-intl';

interface ConfidenceBadgeProps {
  confidence: number | null;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const t = useTranslations('prescriptions.confidence');

  if (confidence === null) return null;

  let label: string;
  let className: string;

  if (confidence > 0.85) {
    label     = t('high');
    className = 'bg-green-100 text-green-700';
  } else if (confidence >= 0.6) {
    label     = t('medium');
    className = 'bg-amber-100 text-amber-700';
  } else {
    label     = t('low');
    className = 'bg-red-100 text-red-700';
  }

  return (
    <span className={`badge ${className}`}>
      {label}
    </span>
  );
}
