import { submitInquiry } from '@/lib/database';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return new Response('Cross-site requests are not accepted.', { status: 403 });
    } catch { return new Response('Invalid request origin.', { status: 403 }); }
  }
  if (Number(request.headers.get('content-length') ?? 0) > 5000) return new Response('Message is too long.', { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Form data is required.', { status: 415 });
  if (String(form.get('website') ?? '')) return Response.redirect(new URL('/thank-you.html', request.url), 303);
  try {
    await submitInquiry({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      topic: String(form.get('topic') ?? ''),
      message: String(form.get('message') ?? ''),
    });
    return Response.redirect(new URL('/thank-you.html', request.url), 303);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'We could not save your message. Please email us instead.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}
