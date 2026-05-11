/**
 * Shared types for encoders.
 *
 * The UI only talks to the Encoder interface, not the concrete implementation,
 * so we can swap WebCodecs / ffmpeg.wasm without changes upstream.
 */

export interface ExportSettings {
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  /**
   * Input frame rate for image-sequence encoding. Each input image lasts
   * `1 / sequenceFps` seconds in the output.
   *
   * Set equal to `fps` for a "1 image = 1 output frame" pass-through.
   * Set to 1 to make each image last a full second (slideshow style);
   * the output is then duplicated up to `fps` so the final file still
   * runs at the output frame rate.
   *
   * Ignored for `kind: "video"` jobs.
   */
  sequenceFps: number;
  /** Target video bitrate in bits/sec (e.g. 18_000_000 for 18 Mbps). */
  videoBitrate: number;
  /** Max video bitrate in bits/sec (e.g. 20_000_000 for 20 Mbps). */
  maxVideoBitrate: number;
  /** Keyframe interval in frames (GOP). */
  keyframeInterval: number;
  /** Audio bitrate in bits/sec (e.g. 320_000 for 320 kbps). */
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: number;
}

/** The DDA delivery preset matching dda_video_template_compress.sh. */
export const DDA_PRESET: ExportSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  sequenceFps: 30,
  videoBitrate: 18_000_000,
  maxVideoBitrate: 20_000_000,
  keyframeInterval: 90,
  audioBitrate: 320_000,
  audioSampleRate: 48_000,
  audioChannels: 2,
};

export type EncoderId = "webcodecs" | "ffmpeg-wasm";

export type EncodeStage =
  | "queued"
  | "analyzing"
  | "decoding"
  | "encoding"
  | "muxing"
  | "done"
  | "cancelled"
  | "failed";

export interface EncodeProgress {
  stage: EncodeStage;
  /** 0..1 fraction complete for this single file. */
  fileProgress: number;
  message?: string;
  currentFrame?: number;
  totalFrames?: number;
  elapsedMs?: number;
  etaMs?: number;
}

export type JobKind = "video" | "sequence";

export interface EncodeJob {
  /**
   * Source files. Length 1 for kind="video"; N (1..N) for kind="sequence".
   * Sequence files should be in render order — the encoder writes them to
   * the wasm FS with numeric names and uses ffmpeg's pattern input.
   */
  files: File[];
  kind: JobKind;
  /** Display name (used to derive the output filename). */
  name: string;
  settings: ExportSettings;
  signal: AbortSignal;
  onProgress: (progress: EncodeProgress) => void;
}

export interface EncodeResult {
  blob: Blob;
  filename: string;
  /** Duration in seconds, if known. */
  duration: number;
  originalBytes: number;
  outputBytes: number;
  encoder: EncoderId;
}

export interface Encoder {
  /** Stable identifier used in UI and logs. */
  readonly id: EncoderId;
  /** Human-readable label. */
  readonly label: string;
  /**
   * Returns true if this encoder can run in the current browser, with the
   * given settings. Implementations should be cheap to call (cache results).
   */
  isSupported(settings: ExportSettings): Promise<boolean>;
  /** Encode a single file. Resolves with the result on success. */
  encode(job: EncodeJob): Promise<EncodeResult>;
}

/** Build the suggested output filename from a display name. */
export function makeOutputFilename(name: string): string {
  // Strip trailing slash (common for sequence "folder/" names) and
  // any extension, then add the canonical suffix.
  const stripped = name.replace(/\/+$/g, "");
  const dot = stripped.lastIndexOf(".");
  const stem = dot > 0 ? stripped.slice(0, dot) : stripped;
  // Sanitize for download — remove path separators.
  const safe = stem.replace(/[\\/]/g, "_");
  return `${safe}_h264_show.mp4`;
}
