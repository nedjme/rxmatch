import type { Metadata } from 'next';
import { JournalPage } from '@/components/journal/JournalPage';

export const metadata: Metadata = { title: 'Journal d\'activité' };

export default function Page() {
  return <JournalPage />;
}
