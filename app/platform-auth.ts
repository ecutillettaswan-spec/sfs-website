import { headers } from 'next/headers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type PlatformUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: 'cloudflare-access' | 'sites';
};

const ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email';
const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
const ACCESS_COOKIE = 'CF_Authorization';
const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER = 'oai-authenticated-user-full-name-encoding';

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function normalizedTeamDomain(value: string) {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

async function getCloudflareAccessUser(): Promise<PlatformUser | null> {
  const requestHeaders = await headers();
  const teamDomain = normalizedTeamDomain(process.env.CF_ACCESS_TEAM_DOMAIN ?? '');
  const audience = process.env.CF_ACCESS_AUD?.trim();
  const token = requestHeaders.get(ACCESS_JWT_HEADER)
    ?? cookieValue(requestHeaders.get('cookie'), ACCESS_COOKIE);
  if (!teamDomain || !audience || !token) return null;

  try {
    let jwks = jwksByTeam.get(teamDomain);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
      jwksByTeam.set(teamDomain, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      audience,
      issuer: `https://${teamDomain}`,
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const assertedEmail = requestHeaders.get(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
    if (!email || (assertedEmail && assertedEmail !== email)) return null;
    const subject = typeof payload.sub === 'string' && payload.sub ? payload.sub : email;
    return {
      userId: `cloudflare-access:${subject}`,
      email,
      fullName: null,
      displayName: email.split('@')[0] || email,
      provider: 'cloudflare-access',
    };
  } catch {
    return null;
  }
}

async function getSitesUser(): Promise<PlatformUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER)?.trim().toLowerCase();
  if (!userId || !email) return null;
  const encodedName = requestHeaders.get(USER_FULL_NAME_HEADER);
  let fullName: string | null = null;
  if (encodedName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === 'percent-encoded-utf-8') {
    try { fullName = decodeURIComponent(encodedName); } catch { fullName = null; }
  }
  return { userId, email, fullName, displayName: fullName ?? email, provider: 'sites' };
}

export async function getPlatformUser(): Promise<PlatformUser | null> {
  const provider = (process.env.AUTH_PROVIDER ?? 'sites').trim().toLowerCase();
  if (provider === 'cloudflare-access') return getCloudflareAccessUser();
  if (provider === 'sites') return getSitesUser();
  return null;
}
