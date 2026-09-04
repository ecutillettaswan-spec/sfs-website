import { submitAnonymousFeedback } from '@/lib/database';

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 4096) return Response.json({ error: 'Feedback is too large.' }, { status: 413 });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return Response.json({ error: 'Feedback must be submitted as JSON.' }, { status: 415 });
    }
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) {
      return Response.json({ error: 'Cross-site feedback is not accepted.' }, { status: 403 });
    }
    const body = await request.json() as { cabinetId?: string; kind?: string; productRequest?: string; message?: string; website?: string };
    if (body.website) return Response.json({ ok: true });
    if (!body.cabinetId || !body.kind) return Response.json({ error: 'Choose the feedback that best fits.' }, { status: 400 });
    const result = await submitAnonymousFeedback({
      cabinetId: body.cabinetId,
      kind: body.kind,
      productRequest: body.productRequest,
      message: body.message,
    });
    return Response.json({ ok: true, id: result.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Feedback could not be saved.' }, { status: 400 });
  }
}
