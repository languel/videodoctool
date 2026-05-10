/**
 * File / folder input.
 *
 * Accepts videos and images. Image files dropped together (or as a folder)
 * are grouped into "image sequences" by their parent folder.
 */

export const VIDEO_EXT = [
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "gif",
] as const;

export const IMAGE_EXT = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "tif",
  "tiff",
  "bmp",
] as const;

export const ACCEPT_ATTR = [
  ...VIDEO_EXT.map((e) => "." + e),
  ...IMAGE_EXT.map((e) => "." + e),
  "video/*",
  "image/*",
].join(",");

export type FileKind = "video" | "image";

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function classify(name: string): FileKind | null {
  const e = extOf(name);
  if ((VIDEO_EXT as readonly string[]).includes(e)) return "video";
  if ((IMAGE_EXT as readonly string[]).includes(e)) return "image";
  return null;
}

/** Plain video files. */
export function isVideoFile(file: File): boolean {
  return classify(file.name) === "video";
}

export function isImageFile(file: File): boolean {
  return classify(file.name) === "image";
}

export function isAcceptedFile(file: File): boolean {
  return classify(file.name) !== null;
}

/** From an HTMLInputElement.files. Filtered + de-duplicated. */
export function filesFromInput(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list).filter(isAcceptedFile);
}

/**
 * Walk a DataTransfer and resolve to a flat list of File objects.
 *
 * Strategy: always start from `dt.files` (works on every browser, every
 * origin including file://). Then *additionally* walk `dt.items` to descend
 * into directories — `webkitGetAsEntry` returns null on Chrome's file://
 * origin, so we use it only for folders.
 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const collected: File[] = Array.from(dt.files ?? []);

  const items = dt.items;
  if (items && items.length > 0) {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      if (typeof item.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (!entry) continue;
      if (entry.isDirectory) {
        promises.push(walkEntry(entry, collected));
      }
    }
    await Promise.all(promises);
  }

  // Filter and de-dup. Same name+size+lastModified counts as one.
  const seen = new Set<string>();
  const out: File[] = [];
  for (const f of collected) {
    if (!isAcceptedFile(f)) continue;
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    if (file) {
      // Stash the relative path so the sequence-grouper can use it.
      try {
        Object.defineProperty(file, "webkitRelativePath", {
          value: (entry.fullPath || file.name).replace(/^\//, ""),
          configurable: true,
        });
      } catch {
        // Property is read-only on some platforms — non-fatal.
      }
      out.push(file);
    }
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    while (true) {
      const batch = await readBatch();
      if (!batch.length) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (f) => resolve(f),
      () => resolve(null),
    );
  });
}
