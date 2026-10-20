import { timingSafeEqual } from "node:crypto";

type Role = "staff" | "encoder";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export { json };

/**
 * Bearer-token gate for the fulfillment API.
 * STAFF_TOKEN  -> admin desk (browser)
 * ENCODER_TOKEN -> desktop NFC script (STAFF_TOKEN is accepted there too)
 * Returns a Response to send back when access is denied, or null when allowed.
 */
export function requireToken(request: Request, roles: Role[]): Response | null {
  const wanted = roles
    .map((role) => (role === "staff" ? process.env.STAFF_TOKEN : process.env.ENCODER_TOKEN)?.trim())
    .filter((t): t is string => !!t);
  if (wanted.length === 0) {
    return json(503, { error: "Server token is not configured. Set STAFF_TOKEN / ENCODER_TOKEN." });
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !wanted.some((t) => same(given, t))) {
    return json(401, { error: "Invalid or missing token." });
  }
  return null;
}

/** Tiny in-memory limiter for public endpoints (per server instance, best effort). */
const hits = new Map<string, number[]>();
export function tooMany(request: Request, key: string, limit = 10, windowMs = 60_000): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const bucket = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(bucket, recent);
  return recent.length > limit;
}
