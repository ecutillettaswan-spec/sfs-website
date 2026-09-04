import { getMissionUser } from '@/lib/auth';
import { getMissionControlData, mutateMissionControl } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getMissionUser();
  if (!user) return Response.json({ error: 'Your email is not approved for Mission Control.' }, { status: 403 });
  return Response.json(await getMissionControlData(user), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getMissionUser();
  if (!user) return Response.json({ error: 'Your email is not approved for Mission Control.' }, { status: 403 });
  try {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 24_000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'JSON is required.' }, { status: 415 });
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: 'Cross-site requests are not accepted.' }, { status: 403 });
    const body = await request.json() as { action?: string; payload?: Record<string, unknown> };
    const result = await mutateMissionControl(user, String(body.action ?? ''), body.payload ?? {});
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The action could not be completed.' }, { status: 400 });
  }
}
