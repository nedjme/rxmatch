import type { Metadata } from 'next';
import { CataloguePage } from '@/components/catalogue/CataloguePage';

export const metadata: Metadata = { title: 'Catalogue' };

export default function Page() {
  return <CataloguePage />;
}
