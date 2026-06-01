import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig } from "../loader/loader.js";
import { buildInstallationPlan } from "../planner/index.js";
import {
  applyPlanOverlay,
  loadPlanOverlay,
  planOverlayPathForConfig,
  savePlanOverlay,
  type PlanOverlay,
} from "../planner/overlay.js";

export async function startStudio(opts: { configPath: string; port: number }) {
  const config = loadConfig(opts.configPath);
  const basePlan = buildInstallationPlan(config);
  const planPath = planOverlayPathForConfig(opts.configPath);
  let currentOverlay = loadPlanOverlay(planPath);
  let currentPlan = currentOverlay ? applyPlanOverlay(basePlan, currentOverlay) : basePlan;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/favicon.ico") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (url.pathname === "/api/plan" && req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const payload = JSON.parse(body) as { patch: PlanOverlay };
        const nextOverlay: PlanOverlay = currentOverlay ?? { version: 1 };
        nextOverlay.positions = {
          ...(nextOverlay.positions ?? {}),
          ...(payload.patch.positions ?? {}),
        };
        nextOverlay.disabled = [...new Set([...(nextOverlay.disabled ?? []), ...(payload.patch.disabled ?? [])])];
        nextOverlay.overrides = {
          ...(nextOverlay.overrides ?? {}),
          ...(payload.patch.overrides ?? {}),
        };
        currentOverlay = nextOverlay;
        currentPlan = applyPlanOverlay(basePlan, nextOverlay);
        savePlanOverlay(planPath, nextOverlay);
        res.statusCode = 204;
        res.end();
      });
      return;
    }

    if (url.pathname === "/api/plan") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(currentPlan));
      return;
    }

    if (url.pathname === "/studio") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(renderStudioHtml());
      return;
    }

    if (url.pathname.startsWith("/studio/")) {
      serveStudioAsset(url.pathname, res);
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(opts.port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function renderStudioHtml() {
  const stylesheetLinks = studioStylesheetLinks();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plan Canvas</title>
    ${stylesheetLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/studio/app.js"></script>
  </body>
</html>`;
}

function studioStylesheetLinks(): string {
  const assetsDir = path.resolve("dist/studio/assets");
  if (!fs.existsSync(assetsDir)) return "";
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => `<link rel="stylesheet" href="/studio/assets/${name}" />`)
    .join("\n    ");
}

function serveStudioAsset(requestPath: string, res: http.ServerResponse): void {
  const relative = requestPath.replace(/^\/studio\//, "");
  const assetPath = path.resolve("dist/studio", relative);
  const studioRoot = path.resolve("dist/studio");
  if (!assetPath.startsWith(studioRoot) || !fs.existsSync(assetPath)) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  res.setHeader("content-type", contentTypeFor(assetPath));
  fs.createReadStream(assetPath).pipe(res);
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
