export function GET() {
  return new Response('User-agent: *\nAllow: /\nAllow: /impact\nAllow: /feedback/\nDisallow: /missioncontrol\nDisallow: /mission-control\nDisallow: /api/\n\nSitemap: https://studentsfeedingstudents.org/sitemap.xml\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
