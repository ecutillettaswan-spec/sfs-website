import { getStockingHistoryCsv } from '@/lib/stocking';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { today, csv } = await getStockingHistoryCsv();
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sfs-stocking-history-${today}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('stocking history export failed', error);
    return new Response('The stocking history is unavailable right now. Try again in a moment.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
