/**
 * Overall progress / status line at the top of the controls bar.
 *
 * Reports things like "File 2 / 7 · encoding · 38% · elapsed 1m 12s".
 */

import { prettyElapsed, spinnerFrame } from "../utils/time.js";
import type { EncodeProgress, EncodeStage } from "../encoders/types.js";

export interface OverallProgressState {
  total: number;
  doneCount: number;
  currentIndex: number; // 1-based, while a file is active
  currentName?: string;
  currentProgress?: EncodeProgress;
  active: boolean;
}

export class OverallProgress {
  private tick = 0;
  private timer: number | null = null;
  private state: OverallProgressState = { total: 0, doneCount: 0, currentIndex: 0, active: false };

  constructor(private readonly el: HTMLElement) {
    this.timer = window.setInterval(() => {
      this.tick++;
      if (this.state.active) this.repaint();
    }, 90);
  }

  dispose() {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  set(state: Partial<OverallProgressState>) {
    this.state = { ...this.state, ...state };
    this.repaint();
  }

  reset() {
    this.state = { total: 0, doneCount: 0, currentIndex: 0, active: false };
    this.el.textContent = "";
  }

  private repaint() {
    const { total, doneCount, currentIndex, active, currentName, currentProgress } = this.state;
    if (!total) {
      this.el.textContent = "";
      return;
    }
    const parts: string[] = [];
    if (active) {
      parts.push(`${spinnerFrame(this.tick)} File ${currentIndex} / ${total}`);
      if (currentProgress) {
        parts.push(stageLabel(currentProgress.stage));
        parts.push(`${Math.round(currentProgress.fileProgress * 100)}%`);
        if (currentProgress.elapsedMs != null) parts.push(prettyElapsed(currentProgress.elapsedMs));
      }
      if (currentName) parts.push(`(${truncate(currentName, 28)})`);
    } else {
      parts.push(`${doneCount} / ${total} done`);
    }
    this.el.textContent = parts.join(" · ");
  }
}

function stageLabel(stage: EncodeStage): string {
  switch (stage) {
    case "queued": return "queued";
    case "analyzing": return "analyzing";
    case "decoding": return "decoding";
    case "encoding": return "encoding";
    case "muxing": return "muxing";
    case "done": return "done";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    default: return stage;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
