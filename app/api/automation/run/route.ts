import { runScheduledOperations } from '@/lib/database';

export const dynamic = 'force-dynamic';

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const size = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < size; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function POST(request: Request) {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret) return Response.json({ error: 'Automation scheduling is not configured.' }, { status: 503 });
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(supplied, secret)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const result = await runScheduledOperations();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Scheduled operations failed.' }, { status: 500 });
  }
}
