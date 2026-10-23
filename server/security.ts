import type { Express, NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";

// Interim protection for the hosted demo until the console moves onto the PropAI platform API
// (per-user accounts, RBAC, approvals). Every route — UI, API and SSE — sits behind it.

const isProd = process.env.NODE_ENV === "production";

export function assertSecureConfig() {
  if (isProd && (process.env.DEMO_PASSWORD ?? "").length < 16) {
    throw new Error("Refusing to start: DEMO_PASSWORD (16+ chars) must be set in production");
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function basicAuth(req: Request, res: Response, next: NextFunction) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return next(); // local development only (startup check enforces it in production)
  if (req.path === "/healthz") return next();
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (sep > 0 && safeEqual(user, process.env.DEMO_USER ?? "demo") && safeEqual(pass, password)) return next();
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="PropAI demo", charset="UTF-8"');
  res.status(401).send("Authentication required");
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    );
  }
  next();
}

// Fixed-window limiter for state-changing API calls (per client IP).
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET") return next();
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000).toString());
      return res.status(429).json({ message: "Too many requests" });
    }
    next();
  };
}

export function applySecurity(app: Express) {
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS at its proxy
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use(securityHeaders);
  app.use(basicAuth);
  app.use("/api", rateLimit(60, 60_000));
}
