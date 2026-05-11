/**
 * Preset panel: collapsed summary that expands into a 2-column form.
 *
 * Owns its expand/collapse state. Reports preset changes via `onChange`.
 */

import type { ExportSettings } from "../encoders/types.js";
import { DDA_PRESET } from "../encoders/types.js";

export interface PresetPanelOptions {
  mountEl: HTMLElement;
  initial: ExportSettings;
  onChange: (next: ExportSettings) => void;
}

export class PresetPanel {
  private current: ExportSettings;
  private expanded = false;

  constructor(private opts: PresetPanelOptions) {
    this.current = { ...opts.initial };
    this.render();
  }

  setSettings(next: ExportSettings): void {
    this.current = next;
    this.render();
  }

  private render(): void {
    this.opts.mountEl.innerHTML = "";
    if (this.expanded) {
      this.opts.mountEl.appendChild(this.renderEditor());
    } else {
      this.opts.mountEl.appendChild(this.renderSummary());
    }
  }

  private renderSummary(): HTMLElement {
    const root = document.createElement("div");
    root.className = "spec collapsed";

    const head = this.makeHead(/* expanded */ false);
    root.appendChild(head);
    return root;
  }

  /**
   * The clickable head row used by both states. The chevron is a separate
   * <button> for accessibility but the whole row is also clickable.
   */
  private makeHead(expandedState: boolean): HTMLElement {
    const head = document.createElement("div");
    head.className = "spec-head";
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    head.setAttribute("aria-expanded", String(expandedState));
    head.setAttribute(
      "aria-label",
      expandedState ? "Collapse preset" : "Expand preset",
    );

    const chev = document.createElement("button");
    chev.type = "button";
    chev.className = "chev-btn" + (expandedState ? " expanded" : "");
    chev.setAttribute("aria-hidden", "true");
    chev.tabIndex = -1;
    chev.innerHTML = chevronSvg();

    const text = document.createElement("span");
    text.className = "spec-head-text";
    const s = this.current;
    if (expandedState) {
      text.innerHTML = `<b>DDA doc preset</b>`;
    } else {
      text.innerHTML =
        `<b>DDA doc preset</b><span class="sep">·</span>` +
        `${s.width}×${s.height} · ${s.fps} fps · H.264 · ` +
        `${Math.round(s.videoBitrate / 1_000_000)} Mbps · AAC ${Math.round(s.audioBitrate / 1000)}k`;
    }

    head.appendChild(chev);
    head.appendChild(text);

    const toggle = (e: Event) => {
      e.preventDefault();
      this.expanded = !this.expanded;
      this.render();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") toggle(e);
    });
    return head;
  }

  private renderEditor(): HTMLElement {
    const root = document.createElement("div");
    root.className = "spec";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Export preset");

    const head = this.makeHead(/* expanded */ true);
    root.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "preset-grid";

    grid.appendChild(this.makeSelect("Resolution", () => `${this.current.width}x${this.current.height}`,
      [
        ["1920x1080", "1920 × 1080  (1080p)"],
        ["1280x720", "1280 × 720  (720p)"],
        ["3840x2160", "3840 × 2160  (4K)"],
      ],
      (v) => {
        const [w, h] = v.split("x").map(Number);
        this.current = { ...this.current, width: w, height: h };
      },
    ));

    grid.appendChild(this.makeSelect("Frame rate", () => String(this.current.fps),
      [
        ["24", "24 fps"],
        ["30", "30 fps"],
        ["60", "60 fps"],
      ],
      (v) => { this.current = { ...this.current, fps: Number(v) }; },
    ));

    // Image-sequence input rate. Output is always `fps`; this controls how
    // long each input image lasts before the next one. 1 fps = 1 sec each.
    grid.appendChild(this.makeNumber("Image seq fps",
      () => this.current.sequenceFps,
      "fps", 0.1, 120,
      (n) => { this.current = { ...this.current, sequenceFps: n }; },
      "any",
    ));

    grid.appendChild(this.makeNumber("Video bitrate",
      () => Math.round(this.current.videoBitrate / 1_000_000),
      "Mbps", 1, 80,
      (n) => { this.current = { ...this.current, videoBitrate: n * 1_000_000 }; },
    ));

    grid.appendChild(this.makeNumber("Max bitrate",
      () => Math.round(this.current.maxVideoBitrate / 1_000_000),
      "Mbps", 1, 100,
      (n) => { this.current = { ...this.current, maxVideoBitrate: n * 1_000_000 }; },
    ));

    grid.appendChild(this.makeSelect("Audio bitrate",
      () => String(Math.round(this.current.audioBitrate / 1000)),
      [
        ["128", "128 kbps"],
        ["192", "192 kbps"],
        ["256", "256 kbps"],
        ["320", "320 kbps"],
      ],
      (v) => { this.current = { ...this.current, audioBitrate: Number(v) * 1000 }; },
    ));

    grid.appendChild(this.makeNumber("Keyframe",
      () => this.current.keyframeInterval,
      "frames", 1, 600,
      (n) => { this.current = { ...this.current, keyframeInterval: n }; },
    ));

    root.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "spec-foot";

    const left = document.createElement("span");
    left.textContent = "MP4 · H.264 High@4.2 · AAC stereo 48 kHz · faststart";

    const right = document.createElement("span");
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "reset";
    resetBtn.addEventListener("click", () => {
      this.current = { ...DDA_PRESET };
      this.opts.onChange(this.current);
      this.render();
    });
    right.appendChild(resetBtn);

    foot.appendChild(left);
    foot.appendChild(right);
    root.appendChild(foot);
    return root;
  }

  private makeSelect(
    label: string,
    getValue: () => string,
    options: Array<[string, string]>,
    onPick: (v: string) => void,
  ): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "pf";
    const lab = document.createElement("span");
    lab.className = "pf-label";
    lab.textContent = label;
    const val = document.createElement("span");
    val.className = "pf-value";
    const sel = document.createElement("select");
    for (const [v, t] of options) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      sel.appendChild(o);
    }
    sel.value = getValue();
    sel.addEventListener("change", () => {
      onPick(sel.value);
      this.opts.onChange(this.current);
    });
    val.appendChild(sel);
    wrap.appendChild(lab);
    wrap.appendChild(val);
    return wrap;
  }

  private makeNumber(
    label: string,
    getValue: () => number,
    unit: string,
    min: number,
    max: number,
    onPick: (n: number) => void,
    step: string = "1",
  ): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "pf";
    const lab = document.createElement("span");
    lab.className = "pf-label";
    lab.textContent = label;
    const val = document.createElement("span");
    val.className = "pf-value";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = step;
    inp.value = String(getValue());
    inp.addEventListener("change", () => {
      const n = Number(inp.value);
      if (Number.isFinite(n)) {
        onPick(n);
        this.opts.onChange(this.current);
      }
    });
    const u = document.createElement("span");
    u.className = "pf-unit";
    u.textContent = unit;
    val.appendChild(inp);
    val.appendChild(u);
    wrap.appendChild(lab);
    wrap.appendChild(val);
    return wrap;
  }
}

function chevronSvg(): string {
  return `
<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 4.5 6 7.5 9 4.5"></polyline>
</svg>`.trim();
}
