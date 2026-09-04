export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL('/mission-control', request.url).toString(),
      'Cache-Control': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
