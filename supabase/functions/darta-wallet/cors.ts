// Only the shop's own origin may call these functions from a browser.
// This file is copied into every function folder; tests/shared-copies.test.mjs keeps the copies identical.

export function allowedOrigins(env: (key: string) => string | undefined): string[] {
  const list = (env('ALLOWED_ORIGINS') ?? env('SITE_URL') ?? '').split(',');
  return list.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
}

export function corsHeaders(req: Request, origins: string[], methods: string): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = req.headers.get('origin');
  if (origin && origins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = methods;
    headers['Access-Control-Allow-Headers'] = 'content-type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

export function reply(req: Request, origins: string[], methods: string, status: number, body?: unknown): Response {
  const headers: Record<string, string> = { ...corsHeaders(req, origins, methods), 'Cache-Control': 'no-store' };
  if (body === undefined) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(body), { status, headers });
}
