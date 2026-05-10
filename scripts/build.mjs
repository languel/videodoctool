#!/usr/bin/env node
// Build script for DDA H.264 Show Compressor.
//
// Two modes, controlled by CLI flags:
//
//   node scripts/build.mjs
//     One-shot production build. Produces:
//       dist/dda-compressor.html  — single self-contained HTML file you can
//                                   double-click to run from your filesystem.
//                                   ffmpeg-core is loaded from a CDN at first
//                                   use (needs internet). No app code is
//                                   served from the network.
//
//   node scripts/build.mjs --watch --serve
//     Dev mode. Rebuilds on every file change, and serves the result at
//     http://127.0.0.1:5173 with the cross-origin isolation headers needed
//     for ffmpeg.wasm's multi-thread build (SharedArrayBuffer).

import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const require_ = createRequire(import.meta.url);

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const SERVE = args.has("--serve");

const ENTRY = path.join(ROOT, "src/main.ts");
const HTML_TEMPLATE = path.join(ROOT, "index.html");
const CSS_FILE = path.join(ROOT, "src/styles.css");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_HTML = path.join(OUT_DIR, "dda-compressor.html");

/**
 * Bundle our custom FFmpeg worker (scripts/worker-src/ffmpeg-worker.js).
 *
 * We don't use @ffmpeg/ffmpeg's dist/esm/worker.js because it has an
 * `importScripts(coreURL)` try/catch fallback. Even though it's wrapped in
 * try/catch, Chromium's strict module-worker policy refuses the call as a
 * cross-origin redirect of the top-level worker script. Our worker uses
 * a clean `await import(blobURL)` only.
 */
async function bundleFFmpegWorker() {
  const workerEntry = path.join(ROOT, "scripts/worker-src/ffmpeg-worker.js");
  const result = await esbuild.build({
    entryPoints: [workerEntry],
    bundle: true,
    write: false,
    // IIFE: the worker has no exports, only side-effecting `self.onmessage`
    // assignment. IIFE works as both a classic worker and a module worker,
    // and crucially avoids the silent-startup-failure we get from esbuild's
    // ESM format in a module-worker context.
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

/** Bundle src/main.ts into a single JS string. */
async function bundleJs() {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: !WATCH,
    sourcemap: WATCH ? "inline" : false,
    loader: { ".ts": "ts" },
    define: {
      "process.env.NODE_ENV": WATCH ? '"development"' : '"production"',
    },
    logLevel: "info",
  });
  return result.outputFiles[0].text;
}

/** Read template HTML and inject CSS + JS inline. */
async function buildHtml() {
  const [template, css, js, workerJs] = await Promise.all([
    fs.readFile(HTML_TEMPLATE, "utf8"),
    fs.readFile(CSS_FILE, "utf8"),
    bundleJs(),
    bundleFFmpegWorker(),
  ]);

  let html = template;

  // Escape any literal "</script>" in the bundled JS so the HTML parser
  // doesn't terminate our inline <script> block early.
  const safeJs = js.replace(/<\/script>/gi, "<\\/script>");
  const safeWorker = workerJs.replace(/<\/script>/gi, "<\\/script>");

  // The FFmpeg main worker (dist/esm/worker.js) is published as a window
  // global before app code loads. The encoder builds a same-origin Blob URL
  // from it. JSON.stringify gives us a JS-safe string literal.
  const workerBootstrap =
    `<script>window.__DDA_FFMPEG_WORKER_SRC = ${JSON.stringify(safeWorker)};</script>`;

  // CRITICAL: use the *function* form of replace so the replacement string
  // is treated literally. With a string replacement, `$&`, `$'`, `` $` ``,
  // and `$<n>` are interpreted as backreferences — and minified JS does
  // contain those sequences, which silently corrupts the bundle.
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\/src\/styles\.css"\s*\/?>/i,
    () => `<style>\n${css}\n</style>`,
  );
  html = html.replace(
    /<script\s+type="module"\s+src="\/src\/main\.ts"><\/script>/i,
    () => `${workerBootstrap}\n<script>\n${safeJs}\n</script>`,
  );

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_HTML, html);
  const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(
    `\x1b[32m✓\x1b[0m built ${path.relative(ROOT, OUT_HTML)} (${sizeKb} KB)`,
  );
}

/** Walk source tree to build a watcher set. */
async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function watchSourceDirs(onChange) {
  const dirs = [path.join(ROOT, "src"), HTML_TEMPLATE];
  const watchers = [];
  for (const d of dirs) {
    const w = (await import("node:fs")).watch(
      d,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;
        if (/(\.ts|\.css|\.html)$/i.test(filename)) onChange(filename);
      },
    );
    watchers.push(w);
  }
  return () => watchers.forEach((w) => w.close());
}

function startServer() {
  const port = 5173;
  const server = createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (url === "/" || url === "/index.html" || url === "/dda-compressor.html") {
      try {
        const body = await fs.readFile(OUT_HTML);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${port}/`, server }),
    );
  });
}

async function main() {
  await buildHtml();

  if (WATCH) {
    let pending = false;
    let rebuilding = false;
    const trigger = async (filename) => {
      if (rebuilding) {
        pending = true;
        return;
      }
      rebuilding = true;
      console.log(`\x1b[2m· change: ${filename}, rebuilding…\x1b[0m`);
      try {
        await buildHtml();
      } catch (err) {
        console.error("\x1b[31m✗ rebuild failed:\x1b[0m", err.message || err);
      } finally {
        rebuilding = false;
        if (pending) {
          pending = false;
          trigger("(coalesced)");
        }
      }
    };
    await watchSourceDirs((f) => void trigger(f));
    if (SERVE) {
      const { url } = await startServer();
      console.log(`\x1b[36m▸\x1b[0m dev server: ${url}`);
      console.log(
        "\x1b[2m  cross-origin isolation headers are set so SharedArrayBuffer (fast ffmpeg.wasm) works.\x1b[0m",
      );
    }
    console.log("\x1b[2m  watching for changes — Ctrl+C to stop.\x1b[0m");
    // Keep alive
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error("\x1b[31m✗ build failed:\x1b[0m", err);
  process.exit(1);
});
