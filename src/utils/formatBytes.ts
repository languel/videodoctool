const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable byte size (binary scale, 1024). */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const i = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  const digits = i === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${UNITS[i]}`;
}

/** Short alias used by the design's queue component. */
export const fmtBytes = formatBytes;

/** Format seconds as M:SS (or "—" if zero/NaN). */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Returns "X% smaller" / "X% larger" comparing output to original. */
export function compareSizes(originalBytes: number, outputBytes: number): string {
  if (!originalBytes || !outputBytes) return "";
  const delta = outputBytes - originalBytes;
  const pct = Math.abs(Math.round((delta / originalBytes) * 100));
  if (delta === 0) return "same size";
  return delta < 0 ? `${pct}% smaller` : `${pct}% larger`;
}
