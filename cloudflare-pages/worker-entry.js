import missionControlApp from './vinext.js';

const PRIVATE_PREFIXES = ['/missioncontrol', '/api/mission-control', '/api/ai', '/api/reports', '/api/automation'];
// Unlisted but open (no password): never cached, never indexed.
const UNLISTED_PREFIXES = ['/stocking', '/stocking-responsibilities', '/api/stocking'];

function withSecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const matches = (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (PRIVATE_PREFIXES.some(matches)) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else if (UNLISTED_PREFIXES.some(matches)) {
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    const response = await missionControlApp.fetch(request, env, context);
    return withSecurityHeaders(response, pathname);
  },
};

export default worker;
