export function GET() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://studentsfeedingstudents.org/</loc><lastmod>2026-09-02</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>https://studentsfeedingstudents.org/impact</loc><lastmod>2026-09-02</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
