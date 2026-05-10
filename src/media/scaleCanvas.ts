/**
 * Scale + letterbox/pillarbox a frame to a target size.
 *
 * Used by the WebCodecs encoder pipeline. Kept separate so it can be unit-
 * tested or swapped to a WebGPU implementation later (see TODO in README).
 */

export interface FitResult {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
}

/**
 * Compute the position/size to draw a (srcW, srcH) image inside a (dstW, dstH)
 * canvas while preserving aspect ratio. The remainder is left as bars so the
 * caller can fill them with black.
 *
 * Mirrors the ffmpeg filter:
 *   scale=W:H:force_original_aspect_ratio=decrease,
 *   pad=W:H:(ow-iw)/2:(oh-ih)/2
 */
export function fitContain(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): FitResult {
  if (srcW <= 0 || srcH <= 0) {
    return { drawX: 0, drawY: 0, drawWidth: dstW, drawHeight: dstH };
  }
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let drawWidth = dstW;
  let drawHeight = dstH;
  if (srcAspect > dstAspect) {
    // letterbox (bars on top/bottom)
    drawHeight = Math.round(dstW / srcAspect);
  } else {
    // pillarbox (bars on left/right)
    drawWidth = Math.round(dstH * srcAspect);
  }
  return {
    drawX: Math.floor((dstW - drawWidth) / 2),
    drawY: Math.floor((dstH - drawHeight) / 2),
    drawWidth,
    drawHeight,
  };
}

/**
 * Paint a VideoFrame onto an OffscreenCanvas at the requested size, with
 * black bars to fill the remainder.
 *
 * The caller is responsible for closing the input frame and constructing a
 * new VideoFrame from the canvas.
 */
export function drawFrameContain(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  frame: VideoFrame,
  dstW: number,
  dstH: number,
): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, dstW, dstH);
  const { drawX, drawY, drawWidth, drawHeight } = fitContain(
    frame.displayWidth,
    frame.displayHeight,
    dstW,
    dstH,
  );
  // VideoFrame is drawable; some TS lib versions don't expose this overload.
  (ctx as CanvasRenderingContext2D).drawImage(
    frame as unknown as CanvasImageSource,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
}
