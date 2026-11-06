import "server-only";

/** The public origin this request came in on (proxies set the forwarded headers). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "A2A-Version, A2A-Extensions, ETag",
} as const;

/** CORS preflight for agents running in a browser. */
export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, A2A-Version, A2A-Extensions, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * A public JSON document (an Agent Card), cacheable: ETag from content, 304 when unchanged
 * (A2A spec §8.6 caching).
 */
export async function publicJson(request: Request, body: unknown) {
  const json = JSON.stringify(body);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const etag = `"${Buffer.from(digest).toString("base64url").slice(0, 22)}"`;
  const headers = { ...cors, "Cache-Control": "public, max-age=60", ETag: etag };
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(json, { headers: { ...headers, "Content-Type": "application/json" } });
}
