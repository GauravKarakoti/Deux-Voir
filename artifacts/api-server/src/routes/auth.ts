import { Router, type IRouter } from "express";
import {
  GetAdminSessionResponse,
  LoginAdminBody,
  LoginAdminResponse,
  LogoutAdminResponse,
} from "@workspace/api-zod";
import {
  endAdminSession,
  isAdminSessionValid,
  isSameOriginRequest,
  startAdminSession,
  verifyAdminPassword,
} from "../lib/admin-session";

const router: IRouter = Router();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getLoginLimit(ip: string) {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    return { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  return current;
}

router.get("/auth/session", (req, res) => {
  res.json(
    GetAdminSessionResponse.parse({
      authenticated: isAdminSessionValid(req),
    }),
  );
});

router.post("/auth/login", (req, res) => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Request origin was not accepted" });
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const limit = getLoginLimit(ip);
  if (limit.count >= MAX_LOGIN_ATTEMPTS) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }

  const input = LoginAdminBody.safeParse(req.body);
  if (!input.success) {
    loginAttempts.set(ip, { ...limit, count: limit.count + 1 });
    res.status(400).json({ error: "A password is required" });
    return;
  }

  try {
    if (!verifyAdminPassword(input.data.password)) {
      loginAttempts.set(ip, { ...limit, count: limit.count + 1 });
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    loginAttempts.delete(ip);
    startAdminSession(res);
    res.json(LoginAdminResponse.parse({ authenticated: true }));
  } catch (error) {
    req.log.error({ err: error }, "Administrator sign-in failed");
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.post("/auth/logout", (req, res) => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Request origin was not accepted" });
    return;
  }

  endAdminSession(req, res);
  res.json(LogoutAdminResponse.parse({ success: true }));
});

export default router;