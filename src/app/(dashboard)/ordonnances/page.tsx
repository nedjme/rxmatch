import type { Metadata } from 'next';
import { PrescriptionList } from '@/components/prescriptions/PrescriptionList';

export const metadata: Metadata = { title: 'Ordonnances' };

export default function OrdonnancesPage() {
  return <PrescriptionList />;
}
