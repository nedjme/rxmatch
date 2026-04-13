import type { Metadata } from 'next';
import { ImportWizard } from '@/components/catalogue/ImportWizard';

export const metadata: Metadata = { title: 'Importer un catalogue' };

export default function Page() {
  return <ImportWizard />;
}
