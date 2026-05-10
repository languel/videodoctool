/**
 * App orchestration: dropzone → queue → encoder → preview.
 *
 * One file at a time. Source of truth for items, expansion state, and the
 * current preset lives here; the UI views are presentational.
 */

import { bindThemeToggle } from "./ui/themeToggle.js";
import { bindDropzone } from "./ui/dropzone.js";
import { PresetPanel } from "./ui/presetPanel.js";
import { QueueView, type QueueItem } from "./ui/queue.js";
import { fmtBytes } from "./utils/formatBytes.js";
import { extOf, classify } from "./media/fileInput.js";
import { readVideoMetadata } from "./media/metadata.js";
import {
  DDA_PRESET,
  type Encoder,
  type EncodeProgress,
  type ExportSettings,
  makeOutputFilename,
} from "./encoders/types.js";
import { FFmpegWasmEncoder } from "./encoders/ffmpegWasmEncoder.js";

interface DemoSeed {
  kind: "video" | "sequence";
  name: string;
  size: number;
  dur: number;
  w: number;
  h: number;
  frames?: number;
  ext?: string;
}

const DEMO_FILES: DemoSeed[] = [
  { kind: "video",    name: "alex_chen_final_cut.mov", size: 482_300_000, dur: 184, w: 3840, h: 2160 },
  { kind: "video",    name: "midterm_show_reel.mp4",   size: 219_700_000, dur: 92,  w: 1920, h: 1080 },
  { kind: "sequence", name: "render_passes/",          size: 612_400_000, dur: 240, w: 3840, h: 2160, frames: 7200, ext: "png" },
  { kind: "video",    name: "p3_capstone_v3.webm",     size: 211_400_000, dur: 188, w: 1920, h: 1080 },
];

interface Els {
  themeBtn: HTMLButtonElement;
  drop: HTMLElement;
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  chooseBtn: HTMLButtonElement;
  demoBtn: HTMLButtonElement;
  banner: HTMLElement;
  specMount: HTMLElement;
  queueRoot: HTMLElement;
  queueTitle: HTMLElement;
  queueActions: HTMLElement;
  queueList: HTMLElement;
  exportBtn: HTMLButtonElement;
  downloadAllBtn: HTMLButtonElement;
  summary: HTMLElement;
}

export function bootApp(): void {
  const els = collectEls();

  // Theme
  bindThemeToggle(els.themeBtn);

  // State
  let items: QueueItem[] = [];
  let expanded: Record<string, boolean> = {};
  let preset: ExportSettings = { ...DDA_PRESET };
  let running = false;
  let currentAbort: AbortController | null = null;
  let currentItemId: string | null = null;
  let nextId = 1;

  const queueView = new QueueView(els.queueRoot, els.queueTitle, els.queueActions, els.queueList, {
    onRemove: (id) => removeItem(id),
    onCancel: (id) => cancelItem(id),
    onToggleExpand: (id) => toggleExpand(id),
    onClearAll: () => clearAll(),
    onClearCompleted: () => clearCompleted(),
  });

  const presetPanel = new PresetPanel({
    mountEl: els.specMount,
    initial: preset,
    onChange: (next) => {
      preset = next;
    },
  });

  bindDropzone({
    rootEl: els.drop,
    fileInput: els.fileInput,
    folderInput: els.folderInput,
    chooseBtn: els.chooseBtn,
    demoBtn: els.demoBtn,
    onFiles: (files) => ingest(files),
    onDemo: () => loadDemo(),
  });

  els.exportBtn.addEventListener("click", () => void runQueue());
  els.downloadAllBtn.addEventListener("click", () => downloadAll());

  refreshActions();

  // ---- ingest --------------------------------------------------------------

  function ingest(files: File[]): void {
    const newItems: QueueItem[] = [];
    const seqMap = new Map<string, File[]>();

    for (const f of files) {
      const k = classify(f.name);
      if (!k) continue;
      if (k === "video") {
        let srcUrl: string | undefined;
        try { srcUrl = URL.createObjectURL(f); } catch { /* ignore */ }
        const guess = guessDimsFromName(f.name);
        const item: QueueItem = {
          id: String(nextId++),
          kind: "video",
          name: f.name,
          size: f.size || 0,
          dur: NaN,
          w: guess.w,
          h: guess.h,
          files: [f],
          srcUrl,
          outSize: 0,
          status: "queued",
          progress: 0,
          speed: 0,
        };
        newItems.push(item);
      } else {
        // image
        const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "__loose__";
        const arr = seqMap.get(folder) ?? [];
        arr.push(f);
        seqMap.set(folder, arr);
      }
    }

    for (const [folder, imgs] of seqMap) {
      // Preserve frame ordering by name (e.g. frame_0001.png, frame_0002.png).
      imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const totalSize = imgs.reduce((s, x) => s + (x.size || 0), 0);
      const ext = extOf(imgs[0].name);
      const item: QueueItem = {
        id: String(nextId++),
        kind: "sequence",
        name: folder === "__loose__" ? imgs[0].name : `${folder}/`,
        size: totalSize,
        dur: imgs.length / preset.fps,
        w: 0,
        h: 0,
        files: imgs,
        outSize: 0,
        status: "queued",
        progress: 0,
        speed: 0,
        frames: imgs.length,
        ext,
      };
      newItems.push(item);
    }

    if (newItems.length === 0) return;
    items = [...items, ...newItems];
    // Auto-expand the preview pane for video items as soon as they're
    // queued, so the user sees the source immediately and watches the
    // Exported pane fill in once encoding finishes.
    for (const item of newItems) {
      if (item.kind === "video") expanded[item.id] = true;
    }
    queueView.setExpanded(expanded);
    queueView.setItems(items);
    refreshActions();

    // Backfill metadata for video items.
    for (const item of newItems) {
      if (item.kind !== "video" || item.files.length === 0) continue;
      void readVideoMetadata(item.files[0]).then((meta) => {
        item.dur = meta.durationSeconds;
        if (meta.width) item.w = meta.width;
        if (meta.height) item.h = meta.height;
        queueView.setItems(items);
      });
    }
  }

  function loadDemo(): void {
    const demoItems: QueueItem[] = DEMO_FILES.map((d) => ({
      id: String(nextId++),
      kind: d.kind,
      name: d.name,
      size: d.size,
      dur: d.dur,
      w: d.w,
      h: d.h,
      files: [], // No real files — demo only.
      outSize: 0,
      status: "queued",
      progress: 0,
      speed: 0,
      frames: d.frames,
      ext: d.ext,
    }));
    items = [...items, ...demoItems];
    queueView.setItems(items);
    refreshActions();
  }

  // ---- queue management ----------------------------------------------------

  function removeItem(id: string): void {
    const item = items.find((x) => x.id === id);
    if (item) revokeUrls(item);
    items = items.filter((x) => x.id !== id);
    delete expanded[id];
    queueView.setExpanded(expanded);
    queueView.setItems(items);
    refreshActions();
  }

  function cancelItem(id: string): void {
    if (currentItemId === id && currentAbort) {
      currentAbort.abort();
    }
  }

  function clearAll(): void {
    if (running) return;
    for (const i of items) revokeUrls(i);
    items = [];
    expanded = {};
    queueView.setExpanded(expanded);
    queueView.setItems(items);
    refreshActions();
  }

  function clearCompleted(): void {
    const removed = items.filter((x) => x.status === "done");
    for (const i of removed) revokeUrls(i);
    items = items.filter((x) => x.status !== "done");
    for (const i of removed) delete expanded[i.id];
    queueView.setExpanded(expanded);
    queueView.setItems(items);
    refreshActions();
  }

  function toggleExpand(id: string): void {
    expanded[id] = !expanded[id];
    queueView.setExpanded(expanded);
  }

  // ---- export run ----------------------------------------------------------

  async function runQueue(): Promise<void> {
    if (running) return;
    running = true;
    queueView.setRunning(true);
    refreshActions();

    const encoder = new FFmpegWasmEncoder();

    const queue = items.filter((x) => x.status === "queued");
    for (const item of queue) {
      currentItemId = item.id;
      currentAbort = new AbortController();
      item.status = "encoding";
      item.progress = 0;
      item.speed = 0;
      queueView.setItems(items);
      refreshActions();

      try {
        if (item.files.length === 0) {
          throw new Error("demo file — no source to encode");
        }
        if (item.kind === "sequence") {
          throw new Error("image sequence encoding coming soon");
        }
        await encodeOne(encoder, item, currentAbort.signal);
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError" || /cancel|terminat/i.test(e.message)) {
          item.status = "cancelled";
        } else {
          item.status = "err";
          item.errorMessage = e.message;
          // Surface in console for debugging.
          console.error("[encoder]", e);
        }
      } finally {
        currentAbort = null;
        currentItemId = null;
        queueView.setItems(items);
        refreshActions();
      }
    }

    running = false;
    queueView.setRunning(false);
    refreshActions();
  }

  async function encodeOne(
    encoder: Encoder,
    item: QueueItem,
    signal: AbortSignal,
  ): Promise<void> {
    const startedAt = performance.now();
    const file = item.files[0];

    const onProgress = (p: EncodeProgress) => {
      // Translate ffmpeg's 0..1 progress to % and a synthetic speed.
      const pct = Math.min(100, p.fileProgress * 100);
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const encodedSec = Number.isFinite(item.dur) && item.dur > 0
        ? item.dur * p.fileProgress
        : 0;
      const speed = elapsedSec > 0 && encodedSec > 0 ? encodedSec / elapsedSec : 0;
      item.progress = pct;
      item.speed = speed;
      queueView.patchProgress(item.id, pct, speed);
    };

    const result = await encoder.encode({
      file,
      settings: preset,
      signal,
      onProgress,
    });

    item.status = "done";
    item.progress = 100;
    item.speed = 0;
    item.outSize = result.outputBytes;
    item.outFilename = result.filename || makeOutputFilename(file);
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    item.outUrl = URL.createObjectURL(result.blob);
    item.outBlob = result.blob;
    expanded[item.id] = true;
    queueView.setExpanded(expanded);
  }

  // ---- download -----------------------------------------------------------

  function downloadAll(): void {
    const done = items.filter((x) => x.status === "done" && x.outBlob);
    for (let i = 0; i < done.length; i++) {
      const item = done[i];
      const a = document.createElement("a");
      const url = URL.createObjectURL(item.outBlob!);
      a.href = url;
      a.download = item.outFilename || makeOutputFilename(item.files[0] ?? new File([], "out.mp4"));
      document.body.appendChild(a);
      // Stagger so browsers don't suppress multi-download prompt.
      setTimeout(() => {
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }, i * 200);
    }
  }

  // ---- ui state -----------------------------------------------------------

  function refreshActions(): void {
    const queued = items.filter((x) => x.status === "queued").length;
    const done = items.filter((x) => x.status === "done").length;
    const totalIn = items.reduce((s, x) => s + (x.size || 0), 0);
    const totalOut = items
      .filter((x) => x.status === "done")
      .reduce((s, x) => s + (x.outSize || 0), 0);

    els.exportBtn.disabled = running || queued === 0;
    els.exportBtn.textContent = running
      ? "Encoding…"
      : queued > 0
      ? `Export ${queued} item${queued === 1 ? "" : "s"}`
      : "Export";

    els.downloadAllBtn.hidden = done === 0;
    els.downloadAllBtn.textContent =
      done === 1 ? "Download" : `Download all (${done})`;

    const parts: string[] = [];
    if (totalIn > 0) parts.push(`in ${fmtBytes(totalIn)}`);
    if (totalOut > 0) parts.push(`out ${fmtBytes(totalOut)}`);
    if (done > 0) parts.push(`${done} ready`);
    els.summary.textContent = parts.join(" · ");
  }

  function revokeUrls(item: QueueItem): void {
    if (item.srcUrl) URL.revokeObjectURL(item.srcUrl);
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
  }
}

// ---- helpers --------------------------------------------------------------

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function collectEls(): Els {
  return {
    themeBtn: $<HTMLButtonElement>("theme-toggle"),
    drop: $("drop"),
    fileInput: $<HTMLInputElement>("file-input"),
    folderInput: $<HTMLInputElement>("folder-input"),
    chooseBtn: $<HTMLButtonElement>("btn-choose"),
    demoBtn: $<HTMLButtonElement>("btn-demo"),
    banner: $("banner"),
    specMount: $("spec-mount"),
    queueRoot: $("queue"),
    queueTitle: $("queue-title"),
    queueActions: $("queue-actions"),
    queueList: $("queue-list"),
    exportBtn: $<HTMLButtonElement>("btn-export"),
    downloadAllBtn: $<HTMLButtonElement>("btn-download-all"),
    summary: $("summary"),
  };
}

function guessDimsFromName(name: string): { w: number; h: number } {
  const m = /(\d{3,4})p/i.exec(name);
  if (!m) return { w: 0, h: 0 };
  const h = Number(m[1]);
  if (h === 720) return { w: 1280, h };
  if (h === 1080) return { w: 1920, h };
  if (h === 2160) return { w: 3840, h };
  return { w: Math.round((h * 16) / 9), h };
}
