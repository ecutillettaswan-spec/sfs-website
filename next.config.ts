import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
const privateDashboardHeaders = [
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Vinext classifies the marketing homepage as a static asset, so match it
      // explicitly in addition to the catch-all rule.
      { source: '/', headers: [...securityHeaders, { key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/:path*', headers: securityHeaders },
      { source: '/mission-control', headers: privateDashboardHeaders },
      { source: '/mission-control/:path*', headers: privateDashboardHeaders },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/tracker', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/impact', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default nextConfig;
