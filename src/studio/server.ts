import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig } from "../loader/loader.js";
import { resolveInstallationPlanFromConfig } from "../planner/index.js";
import {
  configHashForPath,
  loadPlanOverlay,
  mergePlanOverlay,
  overlayHashForPath,
  parsePlanOverlaySavePayload,
  PlanOverlayValidationError,
  planOverlayPathForConfig,
  savePlanOverlay,
  toPlanOverlayV2,
} from "../planner/overlay.js";
import type { InstallationPlan } from "../planner/types.js";

const MAX_PLAN_PATCH_BODY_BYTES = 256 * 1024;

export async function startStudio(opts: { configPath: string; port: number }) {
  const loadedConfig = loadConfig(opts.configPath);
  const planPath = planOverlayPathForConfig(opts.configPath);
  let currentOverlay = loadPlanOverlay(planPath);
  let currentResolved = resolveInstallationPlanFromConfig({
    configPath: opts.configPath,
    overlayPath: planPath,
    loadedConfig,
    overlay: currentOverlay,
  });
  let currentPlan = withStudioPlanMetadata(currentResolved.plan, currentResolved);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/favicon.ico") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (url.pathname === "/api/plan" && req.method === "PUT") {
      let bodyBytes = 0;
      const bodyChunks: Buffer[] = [];
      let oversized = false;

      req.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bodyBytes += buffer.byteLength;

        if (bodyBytes > MAX_PLAN_PATCH_BODY_BYTES) {
          oversized = true;
          bodyChunks.length = 0;
          return;
        }

        bodyChunks.push(buffer);
      });
      req.on("end", () => {
        if (oversized) {
          writeJsonError(res, 413, "body_too_large", `Request body must be ${MAX_PLAN_PATCH_BODY_BYTES} bytes or smaller.`);
          return;
        }

        let rawPayload: unknown;

        try {
          rawPayload = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8"));
        } catch {
          writeJsonError(res, 400, "invalid_json", "Request body must be valid JSON.");
          return;
        }

        let saveRequest;
        try {
          saveRequest = parsePlanOverlaySavePayload(rawPayload);
        } catch (err: unknown) {
          if (err instanceof PlanOverlayValidationError) {
            const statusCode = err.code === "missing_patch" ? 400 : 422;
            writeJsonError(res, statusCode, err.code, err.message, { issues: err.issues });
            return;
          }
          writeJsonError(res, 500, "invalid_overlay", "Failed to validate plan overlay patch.", { detail: errorMessage(err) });
          return;
        }

        const currentConfigHash = configHashForPath(opts.configPath);
        const currentOverlayHash = overlayHashForPath(planPath);
        if (saveRequest.base?.configHash && saveRequest.base.configHash !== currentConfigHash) {
          writeJsonError(res, 409, "base_config_conflict", "Source config changed since this plan was loaded.", {
            currentConfigHash,
            currentOverlayHash,
          });
          return;
        }
        if (saveRequest.base?.overlayHash && saveRequest.base.overlayHash !== currentOverlayHash) {
          writeJsonError(res, 409, "overlay_conflict", "Plan overlay changed since this plan was loaded.", {
            currentConfigHash,
            currentOverlayHash,
          });
          return;
        }

        const nextOverlay = mergePlanOverlay(currentOverlay, saveRequest.patch);
        let nextPlan;
        try {
          nextPlan = resolveInstallationPlanFromConfig({
            configPath: opts.configPath,
            overlayPath: planPath,
            loadedConfig,
            overlay: nextOverlay,
          });
        } catch (err: unknown) {
          writeJsonError(res, 422, "invalid_overlay", "Plan overlay patch could not be applied.", { detail: errorMessage(err) });
          return;
        }

        try {
          savePlanOverlay(planPath, nextOverlay);
        } catch (err: unknown) {
          writeJsonError(res, 500, "save_failed", "Failed to save plan overlay.", { detail: errorMessage(err) });
          return;
        }

        currentOverlay = nextOverlay;
        currentResolved = nextPlan;
        currentPlan = withStudioPlanMetadata(currentResolved.plan, currentResolved);
        writeJson(res, {
          ok: true,
          overlayVersion: toPlanOverlayV2(nextOverlay).version,
          configHash: currentResolved.configHash,
          overlayHash: currentResolved.overlayHash,
          diagnostics: currentResolved.diagnostics,
          plan: currentPlan,
        });
      });
      req.on("error", () => {
        if (oversized) {
          writeJsonError(res, 413, "body_too_large", `Request body must be ${MAX_PLAN_PATCH_BODY_BYTES} bytes or smaller.`);
          return;
        }

        writeJsonError(res, 400, "read_failed", "Failed to read request body.");
      });
      return;
    }

    if (url.pathname === "/api/plan") {
      writeJson(res, currentPlan);
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

type StudioPlanMetadata = {
  overlay?: {
    version: 1 | 2 | null;
    configHash: string;
    overlayHash?: string;
  };
};

function withStudioPlanMetadata(
  plan: InstallationPlan,
  resolved: {
    overlayVersion: 1 | 2 | null;
    configHash: string;
    overlayHash?: string;
  }
): InstallationPlan & StudioPlanMetadata {
  return {
    ...plan,
    overlay: {
      version: resolved.overlayVersion,
      configHash: resolved.configHash,
      overlayHash: resolved.overlayHash,
    },
  };
}

function writeJson(res: http.ServerResponse, body: unknown, statusCode = 200): void {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function writeJsonError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
): void {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: { code, message, ...extra } }));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const studioRoot = path.resolve("dist/studio");
  const assetPath = path.resolve(studioRoot, relative);
  if (!isPathInside(studioRoot, assetPath)) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  let assetStats: fs.Stats;
  try {
    assetStats = fs.statSync(assetPath);
  } catch {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  if (!assetStats.isFile()) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  res.setHeader("content-type", contentTypeFor(assetPath));
  fs.createReadStream(assetPath).pipe(res);
}

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
