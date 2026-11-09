import express from "express";
import { createServer } from "http";
import { serveStatic } from "./static";
import { applySecurity, assertSecureConfig } from "./security";

// Serves the console: a static single-page app that signs in against the PropAI platform API.
// There's no API here; this server only adds security headers and a health check.

assertSecureConfig();
const app = express();
const httpServer = createServer(app);
applySecurity(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

(async () => {
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Render sets PORT; default to 5000 locally.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();
