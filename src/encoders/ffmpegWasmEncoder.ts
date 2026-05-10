/**
 * ffmpeg.wasm encoder.
 *
 * Mirrors the command in dda_video_template_compress.sh, with the simplification
 * that v1 runs a single VBR pass instead of the script's two-pass.
 *
 * --------------------------------------------------------------------------
 * Architecture
 * --------------------------------------------------------------------------
 * We deliberately avoid loading anything from a script CDN at runtime
 * (no esm.sh, no jsDelivr). Two reasons:
 *
 *   1. CDNs sometimes redirect their entry URLs (e.g. esm.sh ->
 *      esm.sh/vNNN/...). Chrome refuses to follow cross-origin redirects on
 *      a worker's top-level script, especially when the page is at a null
 *      origin (file://).
 *
 *   2. Loading a Worker constructor from cross-origin script is blocked
 *      from null-origin pages.
 *
 * So we own the FFmpeg main wrapper here (talks to a Web Worker via
 * postMessage, mirroring @ffmpeg/ffmpeg 0.12 protocol), and the build
 * script inlines the worker source onto `window.__DDA_FFMPEG_WORKER_SRC`.
 * The encoder constructs the worker from a same-origin blob: URL.
 *
 * The only cross-origin fetches that remain are for ffmpeg-core itself
 * (the Emscripten-compiled libffmpeg, ~32 MB wasm). unpkg serves these
 * with `Access-Control-Allow-Origin: *`, and they go through the worker's
 * dynamic `import(coreURL)` once the worker is up.
 * --------------------------------------------------------------------------
 */

import {
  type Encoder,
  type EncodeJob,
  type EncodeProgress,
  type EncodeResult,
  type ExportSettings,
  makeOutputFilename,
} from "./types.js";

const FFMPEG_CORE_VERSION = "0.12.10";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
const CORE_MT_BASE = `https://unpkg.com/@ffmpeg/core-mt@${FFMPEG_CORE_VERSION}/dist/esm`;

/* ------------------------------------------------------------------ */
/* Minimal FFmpeg wrapper (replaces @ffmpeg/ffmpeg)                   */
/* ------------------------------------------------------------------ */

const FF_MSG = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  ERROR: "ERROR",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
} as const;

interface FFCallback {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface FFLoadConfig {
  /** Raw text of ffmpeg-core.js. Worker constructs its own blob URL. */
  coreSource: string;
  /** Raw bytes of ffmpeg-core.wasm. Passed via Module.wasmBinary. */
  wasmBinary: Uint8Array;
}

class MiniFFmpeg {
  private worker: Worker;
  private nextId = 1;
  private callbacks = new Map<number, FFCallback>();
  private logCb: ((m: { type: string; message: string }) => void) | null = null;
  private progressCb:
    | ((p: { progress: number; time: number }) => void)
    | null = null;
  private terminated = false;

  constructor(workerUrl: string) {
    // Use a CLASSIC worker (no `type: "module"`). Module workers from a
    // null-origin page (file://) hit Chromium's "top-level worker script
    // cross-origin redirect" check — even with a same-origin blob: URL.
    // Classic workers don't have that policy. Our worker uses only dynamic
    // `import()` (which works in classic workers on modern browsers), no
    // static `import` statements, so module-worker mode wasn't needed.
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (e: MessageEvent) => this.handleMessage(e.data);
    this.worker.onerror = (e: ErrorEvent) => {
      const err = new Error(
        `FFmpeg worker error: ${e.message || "(no details)"}`,
      );
      // Reject every pending call so callers don't hang forever.
      for (const cb of this.callbacks.values()) cb.reject(err);
      this.callbacks.clear();
    };
  }

  private handleMessage(msg: {
    id?: number;
    type: string;
    data: unknown;
  }): void {
    if (msg.type === FF_MSG.LOG) {
      this.logCb?.(msg.data as { type: string; message: string });
      return;
    }
    if (msg.type === FF_MSG.PROGRESS) {
      this.progressCb?.(msg.data as { progress: number; time: number });
      return;
    }
    if (msg.id == null) return;
    const cb = this.callbacks.get(msg.id);
    if (!cb) return;
    this.callbacks.delete(msg.id);
    if (msg.type === FF_MSG.ERROR) {
      cb.reject(new Error(String(msg.data)));
    } else {
      cb.resolve(msg.data);
    }
  }

  private send(
    type: string,
    data: unknown,
    transfer?: Transferable[],
  ): Promise<unknown> {
    if (this.terminated) {
      return Promise.reject(new Error("FFmpeg worker terminated"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, data }, { transfer: transfer ?? [] });
    });
  }

  async load(config: FFLoadConfig): Promise<boolean> {
    // Transfer the wasm buffer to avoid a 32 MB copy.
    return (await this.send(
      FF_MSG.LOAD,
      config,
      [config.wasmBinary.buffer as ArrayBuffer],
    )) as boolean;
  }

  async exec(args: string[]): Promise<number> {
    return (await this.send(FF_MSG.EXEC, { args, timeout: -1 })) as number;
  }

  async writeFile(path: string, data: Uint8Array): Promise<boolean> {
    // Transfer the buffer so we don't double-allocate the file in memory.
    return (await this.send(
      FF_MSG.WRITE_FILE,
      { path, data },
      [data.buffer],
    )) as boolean;
  }

  async readFile(path: string): Promise<Uint8Array> {
    return (await this.send(FF_MSG.READ_FILE, {
      path,
      encoding: "binary",
    })) as Uint8Array;
  }

  async deleteFile(path: string): Promise<boolean> {
    return (await this.send(FF_MSG.DELETE_FILE, { path })) as boolean;
  }

  on(
    event: "log" | "progress",
    cb:
      | ((m: { type: string; message: string }) => void)
      | ((p: { progress: number; time: number }) => void),
  ): void {
    if (event === "log") {
      this.logCb = cb as (m: { type: string; message: string }) => void;
    } else {
      this.progressCb = cb as (p: { progress: number; time: number }) => void;
    }
  }

  off(event: "log" | "progress"): void {
    if (event === "log") this.logCb = null;
    else this.progressCb = null;
  }

  terminate(): void {
    this.terminated = true;
    try {
      this.worker.terminate();
    } catch {
      /* ignore */
    }
    for (const cb of this.callbacks.values()) {
      cb.reject(new Error("called FFmpeg.terminate()"));
    }
    this.callbacks.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Inline replacements for @ffmpeg/util                                */
/* ------------------------------------------------------------------ */

async function fetchFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Fetch a remote asset cross-origin and return the bytes / text.
 *
 * The bytes are then handed to the worker, which constructs its own blob
 * URLs in its own realm. This is the cleanest way to keep Chromium happy
 * about "top-level worker script" loads when the page is on file://.
 */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!r.ok) {
    throw new Error(`Failed to fetch ${url} — HTTP ${r.status}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!r.ok) {
    throw new Error(`Failed to fetch ${url} — HTTP ${r.status}`);
  }
  return r.text();
}

/* ------------------------------------------------------------------ */
/* Singleton load                                                      */
/* ------------------------------------------------------------------ */

let ffmpegInstance: MiniFFmpeg | null = null;
let loadInstancePromise: Promise<MiniFFmpeg> | null = null;
let classWorkerBlobUrl: string | null = null;

async function loadClassWorkerBlobURL(): Promise<string> {
  if (classWorkerBlobUrl) return classWorkerBlobUrl;
  const src = (globalThis as unknown as { __DDA_FFMPEG_WORKER_SRC?: string })
    .__DDA_FFMPEG_WORKER_SRC;
  if (typeof src !== "string" || !src.length) {
    throw new Error(
      "FFmpeg worker source not found (window.__DDA_FFMPEG_WORKER_SRC). " +
        "Did the build script inline it?",
    );
  }
  const blob = new Blob([src], { type: "text/javascript" });
  classWorkerBlobUrl = URL.createObjectURL(blob);
  return classWorkerBlobUrl;
}

function supportsMultithread(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof globalThis !== "undefined" &&
    (globalThis as unknown as { crossOriginIsolated?: boolean })
      .crossOriginIsolated === true
  );
}

async function getFFmpeg(): Promise<MiniFFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadInstancePromise) return loadInstancePromise;

  loadInstancePromise = (async () => {
    const workerUrl = await loadClassWorkerBlobURL();
    const ff = new MiniFFmpeg(workerUrl);
    ff.on("log", (m: { type: string; message: string }) => {
      // Surface ffmpeg stderr/stdout via console.debug.
      console.debug(`[ffmpeg ${m.type}] ${m.message}`);
    });
    // Always use single-threaded core. Multi-threaded would require
    // SharedArrayBuffer + cross-origin isolation, which file:// can't have.
    const base = CORE_BASE;
    // Fetch raw bytes / text on the main thread. The worker then constructs
    // its own blob URLs in its own realm and uses Module.wasmBinary so
    // ffmpeg-core never does its own fetch. This keeps Chromium happy about
    // worker-top-level cross-origin redirect rules from null origins.
    const [coreSource, wasmBinary] = await Promise.all([
      fetchText(`${base}/ffmpeg-core.js`),
      fetchBytes(`${base}/ffmpeg-core.wasm`),
    ]);
    await ff.load({ coreSource, wasmBinary });
    ffmpegInstance = ff;
    return ff;
  })();
  try {
    return await loadInstancePromise;
  } catch (err) {
    loadInstancePromise = null;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Public Encoder                                                      */
/* ------------------------------------------------------------------ */

export class FFmpegWasmEncoder implements Encoder {
  readonly id = "ffmpeg-wasm" as const;
  readonly label = "ffmpeg.wasm";

  async isSupported(_settings: ExportSettings): Promise<boolean> {
    return typeof WebAssembly !== "undefined";
  }

  async encode(job: EncodeJob): Promise<EncodeResult> {
    const { file, settings, signal, onProgress } = job;
    const startedAt = performance.now();
    const update = (p: Partial<EncodeProgress>) => {
      const elapsedMs = performance.now() - startedAt;
      onProgress({
        stage: p.stage ?? "encoding",
        fileProgress: p.fileProgress ?? 0,
        message: p.message,
        elapsedMs,
        etaMs: estimateEta(p.fileProgress ?? 0, elapsedMs),
      });
    };

    update({ stage: "analyzing", fileProgress: 0, message: "Loading ffmpeg.wasm…" });
    const ff = await getFFmpeg();
    if (signal.aborted) throw abortError();

    // Wire progress. ffmpeg.wasm 0.12 emits { progress: 0..1, time: us }.
    const progressHandler = ({ progress }: { progress: number; time: number }) => {
      const clamped = Math.min(0.999, Math.max(0, progress));
      update({ stage: "encoding", fileProgress: clamped });
    };
    ff.on("progress", progressHandler);

    const inputName = uniqueName("input", file.name);
    const outputName = uniqueName("output", makeOutputFilename(file));

    const onAbort = () => {
      try {
        ff.terminate();
      } catch {
        /* ignore */
      }
      ffmpegInstance = null;
      loadInstancePromise = null;
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      update({ stage: "decoding", fileProgress: 0, message: "Reading file…" });
      const data = await fetchFileBytes(file);
      if (signal.aborted) throw abortError();
      await ff.writeFile(inputName, data);

      const args = buildFFmpegArgs(inputName, outputName, settings);
      update({ stage: "encoding", fileProgress: 0, message: "Encoding…" });

      const exitCode = await ff.exec(args);
      if (signal.aborted) throw abortError();
      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode}`);
      }

      update({ stage: "muxing", fileProgress: 0.99, message: "Reading output…" });
      const out = await ff.readFile(outputName);
      // Copy into a fresh ArrayBuffer-backed Uint8Array. SharedArrayBuffer-
      // backed views aren't accepted by Blob's constructor type.
      const copy = new Uint8Array(out.byteLength);
      copy.set(out);
      const blob = new Blob([copy], { type: "video/mp4" });

      const result: EncodeResult = {
        blob,
        filename: makeOutputFilename(file),
        duration: NaN,
        originalBytes: file.size,
        outputBytes: blob.size,
        encoder: "ffmpeg-wasm",
      };
      update({ stage: "done", fileProgress: 1, message: "Done" });
      return result;
    } finally {
      ff.off("progress");
      signal.removeEventListener("abort", onAbort);
      try { await ff.deleteFile(inputName); } catch { /* ignore */ }
      try { await ff.deleteFile(outputName); } catch { /* ignore */ }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Builds the ffmpeg argv. Mirrors dda_video_template_compress.sh, single-pass.
 * Uses preset=medium because libx264 at "slow" is too slow in the browser.
 */
function buildFFmpegArgs(
  input: string,
  output: string,
  s: ExportSettings,
): string[] {
  const vf =
    `scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,` +
    `pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,` +
    `format=yuv420p`;
  const bufsize = Math.round(s.maxVideoBitrate * 2);
  return [
    "-y",
    "-hide_banner",
    "-i", input,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf", vf,
    "-r", String(s.fps),
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level:v", "4.2",
    "-b:v", `${Math.round(s.videoBitrate / 1000)}k`,
    "-maxrate", `${Math.round(s.maxVideoBitrate / 1000)}k`,
    "-bufsize", `${Math.round(bufsize / 1000)}k`,
    "-g", String(s.keyframeInterval),
    "-keyint_min", String(s.keyframeInterval),
    "-preset", "medium",
    "-c:a", "aac",
    "-b:a", `${Math.round(s.audioBitrate / 1000)}k`,
    "-ar", String(s.audioSampleRate),
    "-ac", String(s.audioChannels),
    "-movflags", "+faststart",
    output,
  ];
}

function estimateEta(fraction: number, elapsedMs: number): number | undefined {
  if (fraction <= 0.01 || elapsedMs < 1500) return undefined;
  if (fraction >= 1) return 0;
  return Math.max(0, elapsedMs / fraction - elapsedMs);
}

function abortError(): Error {
  const e = new Error("Encoding cancelled");
  e.name = "AbortError";
  return e;
}

function uniqueName(prefix: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}_${Date.now().toString(36)}_${safe}`;
}
