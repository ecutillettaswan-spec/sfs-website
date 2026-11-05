import { getStockingState, getStockingVersion, mutateStocking, StockingError } from '@/lib/stocking';

export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

// The page polls this every few seconds. When nothing changed it costs a single
// one-row read and returns { unchanged: true } instead of the whole week.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const version = url.searchParams.get('v');
    const today = url.searchParams.get('d');
    if (version && today) {
      const current = await getStockingVersion();
      if (current.version === version && current.today === today) return Response.json({ unchanged: true }, { headers: noStore });
    }
    return Response.json(await getStockingState(), { headers: noStore });
  } catch (error) {
    console.error('stocking GET failed', error);
    return Response.json({ error: 'The stocking schedule is unavailable right now.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return Response.json({ error: 'Cross-site requests are not accepted.' }, { status: 403, headers: noStore });
    } catch {
      return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStore });
    }
  }
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) return Response.json({ error: 'Request is too large.' }, { status: 413, headers: noStore });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ error: 'JSON is required.' }, { status: 415, headers: noStore });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request.' }, { status: 400, headers: noStore });
  try {
    return Response.json(await mutateStocking(body), { headers: noStore });
  } catch (error) {
    if (error instanceof StockingError) return Response.json({ error: error.message }, { status: 400, headers: noStore });
    console.error('stocking POST failed', error);
    return Response.json({ error: 'That didn’t save. Try again in a moment.' }, { status: 500, headers: noStore });
  }
}
