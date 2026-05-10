/**
 * Runtime feature detection. Used by the UI to show clear messages when a
 * browser can't run an encoder path.
 */

export interface SupportReport {
  /** SharedArrayBuffer is needed for ffmpeg.wasm multi-threaded build. */
  sharedArrayBuffer: boolean;
  /** WebCodecs VideoEncoder is present (does not check codec support). */
  videoEncoder: boolean;
  /** WebCodecs AudioEncoder is present. */
  audioEncoder: boolean;
  /** WebAssembly support, required for ffmpeg.wasm. */
  webAssembly: boolean;
  /** Cross-origin isolation (required for SharedArrayBuffer). */
  crossOriginIsolated: boolean;
  /** File System Access API for folder picking. */
  showDirectoryPicker: boolean;
  /** webkitdirectory file input (folder drop fallback). */
  webkitdirectory: boolean;
}

export function detectSupport(): SupportReport {
  const w = globalThis as unknown as {
    SharedArrayBuffer?: unknown;
    VideoEncoder?: unknown;
    AudioEncoder?: unknown;
    WebAssembly?: unknown;
    crossOriginIsolated?: boolean;
    showDirectoryPicker?: unknown;
  };
  const probeInput = document.createElement("input");
  probeInput.type = "file";
  return {
    sharedArrayBuffer: typeof w.SharedArrayBuffer !== "undefined",
    videoEncoder: typeof w.VideoEncoder !== "undefined",
    audioEncoder: typeof w.AudioEncoder !== "undefined",
    webAssembly: typeof w.WebAssembly !== "undefined",
    crossOriginIsolated: !!w.crossOriginIsolated,
    showDirectoryPicker: typeof w.showDirectoryPicker !== "undefined",
    webkitdirectory: "webkitdirectory" in probeInput,
  };
}

/**
 * H.264 codec strings to probe via VideoEncoder.isConfigSupported, in order
 * from "high profile, level 4.2" down to widely compatible baselines.
 *
 * - avc1.64002A — High @ L4.2 (target for 1080p / 20 Mbps)
 * - avc1.640028 — High @ L4.0
 * - avc1.4D0028 — Main @ L4.0
 * - avc1.42E028 — Constrained Baseline @ L4.0
 */
export const H264_CODEC_CANDIDATES = [
  "avc1.64002A",
  "avc1.640028",
  "avc1.4D0028",
  "avc1.42E028",
];
