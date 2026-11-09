import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// The console uses hash routing (#/approvals, #/team, ...), so it's only ever loaded at "/".
const CONSOLE_PATHS = /^\/(index\.html)?$/;

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // The retired simulation lived at /demo; send old bookmarks to the console.
  app.get("/demo", (_req, res) => res.redirect(301, "/"));
  app.use(express.static(distPath, { index: "index.html" }));
  app.use((req, res) => {
    if (req.method === "GET" && CONSOLE_PATHS.test(req.path)) return res.sendFile(path.resolve(distPath, "index.html"));
    res.status(404).send("Not found");
  });
}
