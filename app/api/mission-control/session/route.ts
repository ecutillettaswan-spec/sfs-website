import {
  clearSharedSessionCookie,
  createSharedSessionToken,
  sharedSessionCookie,
  verifySharedPassword,
} from '@/lib/shared-password-auth';

export const dynamic = 'force-dynamic';

const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

function clientKey(request: Request) {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

function activeAttemptRecord(key: string) {
  const current = failedAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    failedAttempts.delete(key);
    return null;
  }
  return current;
}

function recordFailedAttempt(key: string) {
  const current = activeAttemptRecord(key);
  failedAttempts.set(key, current
    ? { ...current, count: current.count + 1 }
    : { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
  if (failedAttempts.size > 1_000) {
    for (const [attemptKey, record] of failedAttempts) {
      if (record.resetAt <= Date.now()) failedAttempts.delete(attemptKey);
    }
  }
}

function safeReturnTo(value: FormDataEntryValue | null) {
  const raw = typeof value === 'string' ? value : '/missioncontrol';
  try {
    const parsed = new URL(raw, 'https://studentsfeedingstudents.org');
    if (parsed.origin !== 'https://studentsfeedingstudents.org' || parsed.pathname !== '/missioncontrol') return '/missioncontrol';
    parsed.searchParams.delete('login');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/missioncontrol';
  }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Cross-site requests are not accepted.', { status: 403 });
  const attemptKey = clientKey(request);
  if ((activeAttemptRecord(attemptKey)?.count ?? 0) >= MAX_ATTEMPTS) {
    return new Response('Too many password attempts. Try again in 15 minutes.', {
      status: 429,
      headers: { 'cache-control': 'no-store', 'retry-after': '900' },
    });
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 2_048) return new Response('Request is too large.', { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Form data is required.', { status: 415 });
  const returnTo = safeReturnTo(form.get('returnTo'));
  const password = String(form.get('password') ?? '').slice(0, 128);
  const remember = form.get('remember') === 'on';
  if (!await verifySharedPassword(password)) {
    recordFailedAttempt(attemptKey);
    const failed = new URL(returnTo, request.url);
    failed.searchParams.set('login', 'failed');
    return Response.redirect(failed, 303);
  }
  failedAttempts.delete(attemptKey);
  const session = await createSharedSessionToken(remember).catch(() => null);
  if (!session) return new Response('Mission Control authentication is not configured.', { status: 503 });
  return new Response(null, {
    status: 303,
    headers: {
      location: returnTo,
      'set-cookie': sharedSessionCookie(session.token, remember, session.ttlSeconds),
      'cache-control': 'no-store',
    },
  });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response('Cross-site requests are not accepted.', { status: 403 });
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSharedSessionCookie(), 'cache-control': 'no-store' },
  });
}
