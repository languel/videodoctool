/** Format seconds as HH:MM:SS, mirroring the shell script's pretty_time. */
export function prettyTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Format milliseconds as a short, human-readable elapsed string. */
export function prettyElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return prettyTime(s);
}

/**
 * Estimate ETA in ms given fraction-complete and elapsed time.
 * Returns null when the estimate is too noisy to show.
 */
export function estimateEtaMs(
  fraction: number,
  elapsedMs: number,
): number | null {
  if (fraction <= 0.005 || elapsedMs < 1000) return null;
  if (fraction >= 1) return 0;
  const total = elapsedMs / fraction;
  return Math.max(0, total - elapsedMs);
}

export const BRAILLE_SPINNER = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

/** Returns the spinner glyph for a given tick. */
export function spinnerFrame(tick: number): string {
  return BRAILLE_SPINNER[((tick % BRAILLE_SPINNER.length) + BRAILLE_SPINNER.length) % BRAILLE_SPINNER.length];
}
