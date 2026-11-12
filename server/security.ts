import type { Express, NextFunction, Request, Response } from "express";

// The console authenticates against the PropAI platform API with per-user accounts; this server only
// serves its static files, so all it adds is security headers and a health check.

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

export function assertSecureConfig() {
  // HTTPS only: an https console cannot call a plain-http API (browsers block mixed content).
  if (isProd && !apiOrigin().startsWith("https://")) {
    throw new Error("Refusing to start: VITE_PROPAI_API_URL must be an https URL in production");
  }
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

export function applySecurity(app: Express) {
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS at its proxy
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use(securityHeaders);
}
