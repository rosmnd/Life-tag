import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

type StaffConfig = {
  salt: Buffer;
  passwordHash: Buffer;
  sessionSecret: string;
};

const STAFF_USERNAMES = ["Duane", "Kenneth", "Lance", "Rosemande"] as const;
const COOKIE_NAME = "lifetag_staff_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function json(status: number, body: unknown, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export { json };

const hits = new Map<string, number[]>();

export function tooMany(request: Request, key: string, limit = 10, windowMs = 60_000): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const bucket = `${key}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  hits.set(bucket, recent);
  return recent.length > limit;
}

function readStaffConfig(): StaffConfig | null {
  const passwordHashSetting = process.env.STAFF_PASSWORD_HASH?.trim();
  const sessionSecret = process.env.STAFF_SESSION_SECRET;
  if (!passwordHashSetting || !sessionSecret || Buffer.byteLength(sessionSecret) < 32) return null;

  const match = /^scrypt:([a-f\d]{32,}):([a-f\d]{128})$/i.exec(passwordHashSetting);
  if (!match) return null;

  return {
    salt: Buffer.from(match[1], "hex"),
    passwordHash: Buffer.from(match[2], "hex"),
    sessionSecret,
  };
}

export function staffConfigError(): string | null {
  return readStaffConfig()
    ? null
    : "Staff login is not configured. Set STAFF_PASSWORD_HASH and a 32-byte STAFF_SESSION_SECRET.";
}

function scrypt(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyStaffCredentials(username: string, password: string): Promise<boolean> {
  const config = readStaffConfig();
  if (!config) return false;

  const candidateHash = await scrypt(password, config.salt, config.passwordHash.length);
  const allowedUsername = STAFF_USERNAMES.some((name) => sameText(username.toLowerCase(), name.toLowerCase()));
  return allowedUsername &&
    candidateHash.length === config.passwordHash.length &&
    timingSafeEqual(candidateHash, config.passwordHash);
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createStaffSessionCookie(): string {
  const config = readStaffConfig();
  if (!config) throw new Error(staffConfigError() ?? "Staff login is not configured.");

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = String(expiresAt);
  const token = `${value}.${signature(value, config.sessionSecret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearStaffSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return null;
}

export function hasStaffSession(request: Request): boolean {
  const config = readStaffConfig();
  if (!config) return false;

  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const value = token.slice(0, separator);
  const suppliedSignature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(signature(value, config.sessionSecret));
  const expiresAt = Number(value);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  if (suppliedSignature.length !== expectedSignature.length) return false;
  return timingSafeEqual(suppliedSignature, expectedSignature);
}

export function requireStaffSession(request: Request): Response | null {
  const configurationError = staffConfigError();
  if (configurationError) return json(503, { error: configurationError });
  return hasStaffSession(request) ? null : json(401, { error: "Staff login required." });
}

export function loginRateLimited(request: Request): boolean {
  return tooMany(request, "staff-login", LOGIN_LIMIT, LOGIN_WINDOW_MS);
}
