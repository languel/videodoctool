/**
 * Preview panel: source + encoded videos and metadata.
 *
 * Holds onto blob URLs and revokes the previous ones when the preview is
 * replaced, so we don't leak memory across many encodes.
 */

import { compareSizes, formatBytes } from "../utils/formatBytes.js";
import { prettyTime } from "../utils/time.js";
import type { EncodeResult } from "../encoders/types.js";

export interface PreviewElements {
  panel: HTMLElement;
  originalVideo: HTMLVideoElement;
  originalMeta: HTMLElement;
  encodedVideo: HTMLVideoElement;
  encodedMeta: HTMLElement;
  downloadLink: HTMLAnchorElement;
}

export class PreviewPanel {
  private originalUrl: string | null = null;
  private encodedUrl: string | null = null;

  constructor(private readonly el: PreviewElements) {}

  showOriginal(file: File, durationSeconds: number, width: number, height: number) {
    this.el.panel.hidden = false;
    if (this.originalUrl) URL.revokeObjectURL(this.originalUrl);
    this.originalUrl = URL.createObjectURL(file);
    this.el.originalVideo.src = this.originalUrl;
    this.el.originalMeta.textContent = formatOriginalMeta(file, durationSeconds, width, height);
    this.clearEncoded();
  }

  showEncoded(result: EncodeResult) {
    this.el.panel.hidden = false;
    if (this.encodedUrl) URL.revokeObjectURL(this.encodedUrl);
    this.encodedUrl = URL.createObjectURL(result.blob);
    this.el.encodedVideo.src = this.encodedUrl;
    this.el.encodedMeta.textContent = formatEncodedMeta(result);
    this.el.downloadLink.href = this.encodedUrl;
    this.el.downloadLink.download = result.filename;
    this.el.downloadLink.hidden = false;
  }

  private clearEncoded() {
    if (this.encodedUrl) {
      URL.revokeObjectURL(this.encodedUrl);
      this.encodedUrl = null;
    }
    this.el.encodedVideo.removeAttribute("src");
    this.el.encodedVideo.load();
    this.el.encodedMeta.textContent = "";
    this.el.downloadLink.hidden = true;
    this.el.downloadLink.removeAttribute("href");
  }

  dispose() {
    if (this.originalUrl) URL.revokeObjectURL(this.originalUrl);
    if (this.encodedUrl) URL.revokeObjectURL(this.encodedUrl);
    this.originalUrl = null;
    this.encodedUrl = null;
  }
}

function formatOriginalMeta(
  file: File,
  durationSeconds: number,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  parts.push(formatBytes(file.size));
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    parts.push(prettyTime(durationSeconds));
  }
  if (width && height) parts.push(`${width}×${height}`);
  return parts.join(" · ");
}

function formatEncodedMeta(result: EncodeResult): string {
  const parts: string[] = [];
  parts.push(formatBytes(result.outputBytes));
  if (Number.isFinite(result.duration) && result.duration > 0) {
    parts.push(prettyTime(result.duration));
  }
  const cmp = compareSizes(result.originalBytes, result.outputBytes);
  if (cmp) parts.push(cmp);
  parts.push(`encoder: ${result.encoder}`);
  return parts.join(" · ");
}
