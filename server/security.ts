import type { Express, NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";

// The console (/) authenticates against the PropAI platform API with per-user accounts. The original
// simulation (/demo and its /api routes, which hold shared demo data) stays behind a shared password.

const isProd = process.env.NODE_ENV === "production";

// Platform API origin the console calls. Must match the client's VITE_PROPAI_API_URL (or its default).
export function apiOrigin(): string {
  const configured = process.env.VITE_PROPAI_API_URL;
  if (!configured) return "";
  try {
    return new URL(configured).origin;
  } catch {
    throw new Error("VITE_PROPAI_API_URL must be an absolute URL");
  }
}

// Public without the demo password: the console shell and its static assets (it uses hash routing, so
// it is always served at "/"). Everything else — /demo, the simulation's /api and any other path — is
// gated. An allowlist, because Express route matching is case-insensitive (/API/... reaches /api routes).
const CONSOLE_PATHS = /^\/(index\.html|favicon\.png|assets\/[\w.-]+)?$/;
// Development only: the Vite dev server serves the console's source modules from these prefixes.
const VITE_DEV_PATHS = /^\/(?:src|@vite|@react-refresh|@id|@fs|node_modules)(?:\/|$)/;

export function assertSecureConfig() {
  if (isProd && (process.env.DEMO_PASSWORD ?? "").length < 16) {
    throw new Error("Refusing to start: DEMO_PASSWORD (16+ chars) must be set in production");
  }
  // HTTPS only: an https console cannot call a plain-http API (browsers block mixed content).
  if (isProd && !apiOrigin().startsWith("https://")) {
    throw new Error("Refusing to start: VITE_PROPAI_API_URL must be an https URL in production");
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
  if (CONSOLE_PATHS.test(req.path)) return next(); // the console has its own sign-in
  if (!isProd && VITE_DEV_PATHS.test(req.path)) return next();
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
        "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; " +
        `connect-src 'self' ${apiOrigin()}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
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
  // /healthz is registered before the password gate below, so Render's health check stays open.
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS at its proxy
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use(securityHeaders);
  app.use(basicAuth);
  app.use("/api", rateLimit(60, 60_000));
}
