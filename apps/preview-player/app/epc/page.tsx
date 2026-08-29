import { redirect } from 'next/navigation';
import { EPC_VEHICLE_BASE, FITMENT_ID } from '@/lib/epc-catalog';

export default function BrowseEpcEntryPage() {
  redirect(`${EPC_VEHICLE_BASE}?fitment=${encodeURIComponent(FITMENT_ID)}&source=menu`);
}
