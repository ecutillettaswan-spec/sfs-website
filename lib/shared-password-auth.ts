export const SHARED_SESSION_COOKIE = 'sfs_mission_session';
export const SHARED_SESSION_HOURS = 12;
export const SHARED_REMEMBER_DAYS = 30;

const DEVELOPMENT_PASSWORD = 'ABC123';
const DEVELOPMENT_SESSION_SECRET = 'sfs-local-development-session-secret-not-for-production';

function hexFromBytes(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const size = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < size; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function missionPassword() {
  const configured = process.env.MISSION_CONTROL_PASSWORD?.trim();
  if (configured) return configured.toUpperCase();
  return process.env.NODE_ENV === 'production' ? null : DEVELOPMENT_PASSWORD;
}

function sessionSecret() {
  const configured = process.env.MISSION_CONTROL_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  return process.env.NODE_ENV === 'production' ? null : DEVELOPMENT_SESSION_SECRET;
}

async function sessionSignature(payload: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error('Mission Control authentication is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hexFromBytes(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function verifySharedPassword(password: string) {
  const expected = missionPassword();
  if (!expected) return false;
  // Match the legacy tracker behavior so ABC123 and abc123 unlock the same shared access.
  return safeEqual(password.trim().toUpperCase(), expected);
}

export async function createSharedSessionToken(remember: boolean) {
  const ttlSeconds = remember ? SHARED_REMEMBER_DAYS * 86_400 : SHARED_SESSION_HOURS * 3_600;
  const expires = Math.floor(Date.now() / 1_000) + ttlSeconds;
  const nonce = hexFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expires}.${nonce}`;
  return { token: `${payload}.${await sessionSignature(payload)}`, ttlSeconds };
}

export async function verifySharedSessionToken(token: string | null | undefined) {
  if (!token || token.length > 256) return false;
  const [version, expiresValue, nonce, suppliedSignature, ...extra] = token.split('.');
  if (version !== 'v1' || extra.length || !/^\d{10}$/.test(expiresValue ?? '') || !/^[a-f0-9]{32}$/i.test(nonce ?? '') || !/^[a-f0-9]{64}$/i.test(suppliedSignature ?? '')) return false;
  const expires = Number(expiresValue);
  const now = Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SHARED_REMEMBER_DAYS * 86_400 + 60) return false;
  const payload = `${version}.${expiresValue}.${nonce}`;
  try { return safeEqual(suppliedSignature, await sessionSignature(payload)); }
  catch { return false; }
}

export function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

export function sharedSessionCookie(token: string, remember: boolean, ttlSeconds: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const remembered = remember ? `; Max-Age=${ttlSeconds}` : '';
  return `${SHARED_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}${remembered}`;
}

export function clearSharedSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SHARED_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}
