import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, RequestHandler } from "express";

const COOKIE_NAME = "deux_voir_admin";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<string, number>();

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return secret;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}

function signSessionId(id: string): string {
  return createHmac("sha256", getSessionSecret()).update(id).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parseSessionId(token: string | undefined): string | null {
  if (!token) return null;
  const [id, signature, ...extra] = token.split(".");
  if (!id || !signature || extra.length > 0) return null;
  if (!safeEqual(signature, signSessionId(id))) return null;
  return id;
}

export function isAdminSessionValid(req: Request): boolean {
  const id = parseSessionId(req.cookies?.[COOKIE_NAME]);
  if (!id) return false;
  const expiresAt = sessions.get(id);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function startAdminSession(res: Parameters<RequestHandler>[1]): void {
  const now = Date.now();
  for (const [id, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(id);
  }

  const id = randomBytes(32).toString("base64url");
  sessions.set(id, now + SESSION_DURATION_MS);
  res.cookie(COOKIE_NAME, `${id}.${signSessionId(id)}`, cookieOptions());
}

export function endAdminSession(req: Request, res: Parameters<RequestHandler>[1]): void {
  const id = parseSessionId(req.cookies?.[COOKIE_NAME]);
  if (id) sessions.delete(id);
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
}

export function verifyAdminPassword(password: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    throw new Error("ADMIN_PASSWORD is not configured.");
  }
  return safeEqual(password, configuredPassword);
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  try {
    if (!isAdminSessionValid(req)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ err: error }, "Admin session verification failed");
    res.status(500).json({ error: "Unable to verify administrator session" });
  }
};

export function isSameOriginRequest(req: Request): boolean {
  const origin = req.get("origin");
  const host = req.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function getAdminCookieOptionsForTestsOrHealth() {
  return cookieOptions();
}