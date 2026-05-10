/**
 * Pull duration / dimensions from a video file using a hidden HTMLVideoElement.
 *
 * This is "good enough" for the queue UI. For frame-accurate metadata we'd want
 * mp4box.js (and we'll need it for the WebCodecs path), but for v1 we just
 * read what the browser exposes from preload="metadata".
 */

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
}

/** Best-effort metadata read. Resolves with NaNs if the browser refuses. */
export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (result: VideoMetadata) => {
      cleanup();
      resolve(result);
    };

    video.addEventListener("loadedmetadata", () => {
      finish({
        durationSeconds: Number.isFinite(video.duration) ? video.duration : NaN,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    });

    video.addEventListener("error", () => {
      finish({ durationSeconds: NaN, width: 0, height: 0 });
    });

    // Safety net: some files never fire either event.
    setTimeout(() => finish({ durationSeconds: NaN, width: 0, height: 0 }), 8000);
  });
}
