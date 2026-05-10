/**
 * MP4 muxing helpers for the WebCodecs path.
 *
 * Stub for the first pass. The real implementation will use mp4-muxer
 * (https://github.com/Vanilagy/mp4-muxer) to mux H.264 + AAC into MP4 with
 * +faststart equivalent (moov box at the front).
 *
 * Left in the project tree so the structure matches the spec and so the
 * import sites have something to link against.
 */

export interface MuxedOutput {
  blob: Blob;
}

export class NotImplementedMuxerError extends Error {
  constructor() {
    super("MP4 muxing pipeline is not implemented in the first pass.");
    this.name = "NotImplementedMuxerError";
  }
}

/** Placeholder so callers can `import { muxToMp4 } from "./mux.js"`. */
export async function muxToMp4(): Promise<MuxedOutput> {
  throw new NotImplementedMuxerError();
}
