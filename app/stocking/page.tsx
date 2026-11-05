import type { Metadata } from 'next';
import { getStockingState } from '@/lib/stocking';
import StockingBoard from './stocking-board';
import './stocking.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stocking schedule',
  description: 'Who is stocking the SFS cabinets this week.',
  robots: { index: false, follow: false },
};

export default async function StockingPage() {
  // If the database is briefly unreachable, the board still renders and keeps retrying.
  const initialState = await getStockingState().catch((error) => {
    console.error('stocking page failed to load', error);
    return null;
  });
  return <StockingBoard initialState={initialState} />;
}
