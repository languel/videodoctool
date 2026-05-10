/**
 * WebCodecs encoder — preferred long-term path.
 *
 * STATUS: support detection only in this first pass. The full encode pipeline
 * (mp4box.js demux → VideoDecoder → canvas scale/pad → VideoEncoder →
 * mp4-muxer with AudioEncoder/AAC) is the next milestone. Until that lands,
 * `encode()` throws and the app falls back to ffmpeg.wasm.
 *
 * Why split it like this? It lets the UI honestly tell the user whether their
 * browser would *be able* to use the fast path, even before we ship the full
 * implementation.
 */

import { H264_CODEC_CANDIDATES } from "../utils/support.js";
import {
  type Encoder,
  type EncodeJob,
  type EncodeResult,
  type ExportSettings,
} from "./types.js";

interface SupportCacheKey {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
}

const supportCache = new Map<string, Promise<string | null>>();

function cacheKey(s: SupportCacheKey): string {
  return `${s.width}x${s.height}@${s.fps}/${s.videoBitrate}`;
}

/**
 * Returns the first H.264 codec string that the browser claims it can encode
 * at the requested resolution/bitrate, or null if none.
 */
export async function pickH264Codec(s: ExportSettings): Promise<string | null> {
  const w = globalThis as unknown as {
    VideoEncoder?: { isConfigSupported: (cfg: VideoEncoderConfig) => Promise<{ supported?: boolean }> };
  };
  if (!w.VideoEncoder || typeof w.VideoEncoder.isConfigSupported !== "function") {
    return null;
  }
  const key = cacheKey(s);
  const cached = supportCache.get(key);
  if (cached) return cached;

  const probe = (async () => {
    for (const codec of H264_CODEC_CANDIDATES) {
      try {
        const res = await w.VideoEncoder!.isConfigSupported({
          codec,
          width: s.width,
          height: s.height,
          framerate: s.fps,
          bitrate: s.videoBitrate,
          hardwareAcceleration: "prefer-hardware",
          // avc-1 bitstream wraps NAL units in length prefixes; required for mp4-muxer.
          avc: { format: "avc" },
        });
        if (res.supported) return codec;
      } catch {
        // some browsers throw rather than returning {supported:false}
      }
    }
    return null;
  })();
  supportCache.set(key, probe);
  return probe;
}

export class WebCodecsEncoder implements Encoder {
  readonly id = "webcodecs" as const;
  readonly label = "WebCodecs (fast)";

  async isSupported(settings: ExportSettings): Promise<boolean> {
    const codec = await pickH264Codec(settings);
    if (!codec) return false;
    // Audio: AAC encoding via WebCodecs AudioEncoder is uneven across browsers.
    // We require it for honest-output semantics (see spec: "Do not silently
    // produce files with missing audio.").
    const w = globalThis as unknown as {
      AudioEncoder?: { isConfigSupported: (cfg: AudioEncoderConfig) => Promise<{ supported?: boolean }> };
    };
    if (!w.AudioEncoder || typeof w.AudioEncoder.isConfigSupported !== "function") {
      return false;
    }
    try {
      const res = await w.AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        sampleRate: settings.audioSampleRate,
        numberOfChannels: settings.audioChannels,
        bitrate: settings.audioBitrate,
      });
      return !!res.supported;
    } catch {
      return false;
    }
  }

  async encode(_job: EncodeJob): Promise<EncodeResult> {
    // TODO: implement the full pipeline:
    //   1. mp4box.js demux → audio + video samples
    //   2. VideoDecoder → VideoFrame
    //   3. OffscreenCanvas scale+letterbox to target dims
    //   4. VideoEncoder (H.264) with keyframe interval = settings.keyframeInterval
    //   5. AudioDecoder → AudioData → AudioEncoder (AAC)
    //   6. mp4-muxer combines into MP4 with +faststart equivalent
    //   7. Cleanup, return Blob
    throw new Error(
      "WebCodecs encoder is not implemented in this first pass. " +
        "The app should auto-fall-back to ffmpeg.wasm.",
    );
  }
}
