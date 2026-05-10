/**
 * Queue view. One row per item, expandable preview on done.
 *
 * Plain-DOM rendering (no framework). The owning App is the source of truth
 * for the items array; the view re-renders on demand.
 */

import { fmtBytes, fmtDuration } from "../utils/formatBytes.js";

export type ItemKind = "video" | "sequence";
export type ItemStatus = "queued" | "encoding" | "done" | "err" | "cancelled";

export interface QueueItem {
  id: string;
  kind: ItemKind;
  /** Display name. For sequences: "folder/" or first-image name. */
  name: string;
  /** Total bytes. For sequences: sum of all images. */
  size: number;
  /** Duration in seconds. NaN/0 if unknown. */
  dur: number;
  /** Source dimensions (0 if unknown — typical for sequences). */
  w: number;
  h: number;
  /** Source files. For "video": always 1 element. For "sequence": all images. */
  files: File[];
  /** Object URL for source preview. Optional — created on demand. */
  srcUrl?: string;
  /** Object URL for encoded preview. Created when status becomes "done". */
  outUrl?: string;
  /** Encoded output blob (kept around for download). */
  outBlob?: Blob;
  /** Encoded output size in bytes. */
  outSize: number;
  /** Output filename suggestion. */
  outFilename?: string;
  /** Sequence-only: frame count. */
  frames?: number;
  /** Sequence-only: file extension (png/jpg/etc). */
  ext?: string;
  /** Status. */
  status: ItemStatus;
  /** 0..100. */
  progress: number;
  /** Realtime multiplier (encoding speed). */
  speed: number;
  /** Error message. */
  errorMessage?: string;
}

export interface QueueCallbacks {
  onRemove(id: string): void;
  onCancel(id: string): void;
  onToggleExpand(id: string): void;
  onClearAll(): void;
  onClearCompleted(): void;
}

export class QueueView {
  private listEl: HTMLElement;
  private titleEl: HTMLElement;
  private actionsEl: HTMLElement;
  private rootEl: HTMLElement;
  private items: QueueItem[] = [];
  private expanded: Record<string, boolean> = {};
  private running = false;

  constructor(
    rootEl: HTMLElement,
    titleEl: HTMLElement,
    actionsEl: HTMLElement,
    listEl: HTMLElement,
    private cb: QueueCallbacks,
  ) {
    this.rootEl = rootEl;
    this.titleEl = titleEl;
    this.actionsEl = actionsEl;
    this.listEl = listEl;
  }

  setItems(items: QueueItem[]): void {
    this.items = items;
    this.fullRender();
  }

  setExpanded(expanded: Record<string, boolean>): void {
    this.expanded = expanded;
    this.fullRender();
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.renderHeader();
  }

  /** Patch a single row's progress without re-rendering the whole list. */
  patchProgress(id: string, progress: number, speed: number): void {
    const row = this.listEl.querySelector<HTMLElement>(
      `[data-id="${cssEscape(id)}"]`,
    );
    if (!row) return;
    const fill = row.querySelector<HTMLElement>(".bar-fill");
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    const status = row.querySelector<HTMLElement>(".file-status");
    if (status) {
      status.textContent = `${Math.round(progress)}% · ${speed.toFixed(1)}× realtime`;
    }
    // Keep the Exported-pane placeholder in sync when a row is expanded
    // mid-encode. Cheap targeted update; avoids re-rendering the whole row.
    const exportedPane = row.querySelector<HTMLElement>(
      ".preview .pv:nth-child(2) .pv-frame.placeholder",
    );
    if (exportedPane) {
      exportedPane.textContent = `encoding · ${Math.round(progress)}%`;
    }
  }

  private fullRender(): void {
    if (this.items.length === 0) {
      this.rootEl.hidden = true;
      this.listEl.innerHTML = "";
      return;
    }
    this.rootEl.hidden = false;
    this.renderHeader();
    this.renderList();
  }

  private renderHeader(): void {
    if (this.items.length === 0) return;
    const queued = this.items.filter((f) => f.status === "queued").length;
    const done = this.items.filter((f) => f.status === "done").length;
    this.titleEl.textContent =
      `${this.items.length} item${this.items.length === 1 ? "" : "s"} · ` +
      `${queued} queued · ${done} done`;

    this.actionsEl.innerHTML = "";
    if (done > 0) {
      const clearDone = document.createElement("button");
      clearDone.type = "button";
      clearDone.className = "btn ghost";
      clearDone.textContent = "Clear completed";
      clearDone.addEventListener("click", () => this.cb.onClearCompleted());
      this.actionsEl.appendChild(clearDone);
    }
    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "btn ghost";
    clearAll.textContent = "Clear all";
    clearAll.disabled = this.running;
    clearAll.addEventListener("click", () => this.cb.onClearAll());
    this.actionsEl.appendChild(clearAll);
  }

  private renderList(): void {
    this.listEl.innerHTML = "";
    for (const f of this.items) {
      this.listEl.appendChild(this.renderRow(f));
    }
  }

  private renderRow(f: QueueItem): HTMLElement {
    const row = document.createElement("div");
    row.className = "file" + (f.status === "done" ? " done" : f.status === "err" ? " err" : "");
    row.dataset.id = f.id;

    // Column 1 — chevron (or empty placeholder for alignment).
    const chevCell = document.createElement("div");
    chevCell.className = "file-chev";
    if (f.kind === "video" && f.srcUrl) {
      const chev = document.createElement("button");
      chev.type = "button";
      chev.className = "chev-btn" + (this.expanded[f.id] ? " expanded" : "");
      chev.setAttribute(
        "aria-label",
        this.expanded[f.id] ? "Hide preview" : "Show preview",
      );
      chev.title = this.expanded[f.id] ? "Hide preview" : "Show preview";
      chev.innerHTML = chevronSvg();
      chev.addEventListener("click", () => this.cb.onToggleExpand(f.id));
      chevCell.appendChild(chev);
    }

    // Column 2 — name + meta.
    const left = document.createElement("div");
    left.style.minWidth = "0";

    const name = document.createElement("div");
    name.className = "file-name";
    name.title = f.name;
    name.textContent = f.name;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = formatMeta(f);

    left.appendChild(name);
    left.appendChild(meta);

    // Column 3 — status + action buttons.
    const right = document.createElement("div");
    right.className = "file-actions";

    const status = document.createElement("span");
    status.className = "file-status" +
      (f.status === "done" ? " ok" : f.status === "err" ? " err" : "");
    status.textContent = formatStatusText(f);
    right.appendChild(status);

    if (f.status === "encoding") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => this.cb.onCancel(f.id));
      right.appendChild(cancel);
    }
    if (f.status === "queued" || f.status === "err" || f.status === "cancelled") {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "x-btn";
      x.setAttribute("aria-label", "Remove");
      x.textContent = "×";
      x.addEventListener("click", () => this.cb.onRemove(f.id));
      right.appendChild(x);
    }

    row.appendChild(chevCell);
    row.appendChild(left);
    row.appendChild(right);

    if (f.status === "encoding") {
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${f.progress}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
    }

    // Render the preview pane any time the row is expanded and there's
    // something to preview. The Exported pane shows a state-aware
    // placeholder until the encode completes.
    if (this.expanded[f.id] && f.kind === "video") {
      row.appendChild(this.renderPreview(f));
    }

    return row;
  }

  private renderPreview(f: QueueItem): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "preview";

    // Original — show as soon as we have a srcUrl.
    wrap.appendChild(
      this.renderPreviewPane({
        label: "Original",
        src: f.srcUrl,
        meta: f.w && f.h ? `${f.w}×${f.h}` : "",
        placeholderText: "no source",
      }),
    );

    // Exported — placeholder while waiting / encoding / failed.
    const exportedMeta = f.status === "done"
      ? `1920×1080 · ${fmtBytes(f.outSize)}`
      : "";
    wrap.appendChild(
      this.renderPreviewPane({
        label: "Exported",
        src: f.status === "done" ? f.outUrl : undefined,
        meta: exportedMeta,
        placeholderText: exportedPlaceholderText(f),
      }),
    );
    return wrap;
  }

  private renderPreviewPane(args: {
    label: string;
    src: string | undefined;
    meta: string;
    placeholderText: string;
  }): HTMLElement {
    const pv = document.createElement("div");
    pv.className = "pv";

    const lab = document.createElement("div");
    lab.className = "pv-label";
    const ll = document.createElement("span");
    ll.textContent = args.label;
    const lr = document.createElement("span");
    lr.style.color = "var(--muted)";
    lr.textContent = args.meta;
    lab.appendChild(ll);
    lab.appendChild(lr);
    pv.appendChild(lab);

    const frame = document.createElement("div");
    frame.className = "pv-frame";
    if (args.src) {
      const v = document.createElement("video");
      v.src = args.src;
      v.controls = true;
      v.playsInline = true;
      v.muted = true;
      v.loop = true;
      v.preload = "metadata";
      frame.appendChild(v);
    } else {
      frame.classList.add("placeholder");
      frame.textContent = args.placeholderText;
    }
    pv.appendChild(frame);
    return pv;
  }
}

function exportedPlaceholderText(f: QueueItem): string {
  switch (f.status) {
    case "queued":
      return "not exported yet";
    case "encoding":
      return `encoding · ${Math.round(f.progress)}%`;
    case "err":
      return f.errorMessage ? `failed · ${f.errorMessage}` : "failed";
    case "cancelled":
      return "cancelled";
    case "done":
      // Only reachable if outUrl somehow missing on a done row.
      return "no preview";
  }
}

function formatMeta(f: QueueItem): string {
  const parts: string[] = [];
  if (f.kind === "sequence") {
    parts.push("image sequence");
    if (f.frames) parts.push(`${f.frames} frames`);
    if (f.ext) parts.push(f.ext);
  }
  if (f.size) parts.push(fmtBytes(f.size));
  if (f.w && f.h) parts.push(`${f.w}×${f.h}`);
  if (Number.isFinite(f.dur) && f.dur > 0) parts.push(fmtDuration(f.dur));
  return parts.join(" · ");
}

function formatStatusText(f: QueueItem): string {
  switch (f.status) {
    case "queued":
      return "queued";
    case "encoding":
      return `${Math.round(f.progress)}% · ${f.speed.toFixed(1)}× realtime`;
    case "done":
      return "";
    case "err":
      return f.errorMessage ? `failed · ${f.errorMessage}` : "failed";
    case "cancelled":
      return "cancelled";
  }
}

function chevronSvg(): string {
  return `
<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 4.5 6 7.5 9 4.5"></polyline>
</svg>`.trim();
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
