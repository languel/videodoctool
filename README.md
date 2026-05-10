# DDA H.264 Show Compressor

Browser-only video compressor for student MP4/MOV submissions. Drag a file or
folder, hit Start, get a 1080p / 30 fps / H.264 / AAC MP4 you can hand in.

> **Honesty note.** This app targets the same delivery spec as the Adobe Media
> Encoder preset *"Vimeo 30 FPS High Quality 1080p HD DDA 2020"*, but it is
> not byte-for-byte identical to AME. Browser encoders differ slightly. Use
> this when you need a compatible-enough MP4 fast; use AME when you need
> exact parity for a final delivery.

## Two ways to run

### 1. Single-file HTML (click-and-run)

The whole app — UI, encoder wrapper, ffmpeg.wasm worker — is bundled into
**one** `dist/dda-compressor.html` you can double-click.

```sh
npm install
npm run build
open dist/dda-compressor.html       # macOS
xdg-open dist/dda-compressor.html   # Linux
```

The first encode downloads `@ffmpeg/core` (~32 MB wasm) from a CDN. After
that, it's offline-capable for the rest of the browser session.

### 2. Dev server (faster iteration, multi-thread ffmpeg)

```sh
npm run dev   # http://127.0.0.1:5173
```

The dev server sets the cross-origin isolation headers needed for
`SharedArrayBuffer` so ffmpeg.wasm runs in its multi-threaded build —
roughly 2× faster than the single-thread fallback.

## What it produces

`originalname_h264_show.mp4`

```
1920×1080 · 30 fps · H.264 (High @ L4.2) MP4
AAC stereo · 48 kHz · 320 kbps
~18 Mbps target (max 20)
keyframe interval 90 frames
+faststart (moov at front)
```

All settings are adjustable from the **Export settings (advanced)** panel.
"Reset to DDA preset" puts everything back.

## How encoding works

There are two encoder paths behind a single `Encoder` interface
(`src/encoders/types.ts`):

1. **`ffmpeg-wasm`** — runs `libx264` + `aac` in WebAssembly, equivalent to
   the local `dda_video_template_compress.sh` script. Slower, but works
   everywhere with WebAssembly. **This is the working v1 path.**
2. **`webcodecs`** — uses the browser's native `VideoEncoder` /
   `AudioEncoder`. Much faster (often hardware-accelerated) but H.264 + AAC
   support varies by browser. **Support detection only; full pipeline TODO.**

The "Encoder" dropdown in advanced settings lets you pin one path. "Auto"
picks the best available; in this first pass that means ffmpeg.wasm.

## Browser support

| Browser              | Single-file (file://) | Dev server (http://) |
| -------------------- | :-------------------: | :------------------: |
| Chrome / Edge        |          ✅           |          ✅           |
| Firefox              |          ✅           |          ✅           |
| Safari               |       partial         |       partial         |

## Why the single-file build needed special handling

`@ffmpeg/ffmpeg` constructs its main worker with
`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`.
When the page is at a `null` origin (which is what `file://` gets), Chrome
blocks cross-origin worker scripts entirely — the worker won't even start.

The build script (`scripts/build.mjs`) pre-bundles the FFmpeg worker source
with esbuild and inlines it on `window.__DDA_FFMPEG_WORKER_SRC`. At load
time the encoder converts that string into a same-origin `blob:` URL and
passes it via `classWorkerURL`. With a same-origin worker in hand, the
worker can fetch ffmpeg-core from any CDN with permissive CORS (unpkg).

If you run the dev server instead, the page is at an http(s) origin and you
get cross-origin isolation headers, so `SharedArrayBuffer` is available and
ffmpeg.wasm uses the multi-threaded core.

## Memory notes

ffmpeg.wasm keeps the whole input file in its in-WASM filesystem. Long
videos (>5 minutes at 4K source) can OOM the tab. The app processes files
one at a time and clears the wasm filesystem between encodes.

For very long files, prefer the local shell script
(`dda_video_template_compress.sh`) in the project root.

## Project layout

```
index.html                # template — script/style placeholders are inlined at build time
scripts/
  build.mjs               # esbuild bundle + single-file HTML emitter
src/
  main.ts
  app.ts
  styles.css
  encoders/
    types.ts              # Encoder interface + DDA_PRESET
    ffmpegWasmEncoder.ts  # primary v1 encoder
    webcodecsEncoder.ts   # support detection + stub
  media/
    fileInput.ts          # drag/drop + folder walking
    metadata.ts           # duration / dimensions probe
    preview.ts            # original vs encoded preview
    scaleCanvas.ts        # contain-fit math for letterbox/pillarbox
    mux.ts                # mp4-muxer integration (stub)
  ui/
    dropzone.ts
    queue.ts              # per-item rows
    progress.ts           # overall N/M + spinner
  utils/
    time.ts
    formatBytes.ts
    support.ts            # feature detection + H.264 codec candidates
```

## Test fixture workflow

1. `npm run build`
2. `open dist/dda-compressor.html` (or double-click in Finder)
3. Drop a short `.mp4` (10 s – 2 min) onto the dropzone.
4. Source preview appears; metadata fills in within ~1 s.
5. Click **Start**.
6. Watch the row's stage move *analyzing → encoding → muxing → done*.
7. Click **Download** (or the link in the preview pane).

## Bugs fixed during initial testing

These are notes for future maintainers.

- `String.prototype.replace(regex, "...")` interprets `$&`, `$'`, `` $` ``, and
  `$<n>` as substitution patterns. Minified JS often contains those as
  variable names, which silently corrupted the inlined bundle. Build script
  uses the *function* form of replace.
- A `null`-origin page can't construct a `Worker` from a cross-origin URL,
  even with permissive CORS. Pre-bundle the worker and load via blob URL.
- `@ffmpeg/ffmpeg` 0.12 always constructs the worker as `type: "module"`.
  esbuild's IIFE format produces script content that works as either classic
  or module worker — but Chromium's `headless-shell` can't run module
  workers from blob URLs at all. Real Chrome and Firefox both work fine;
  testing with Chromium-headless will mislead you.

## TODO

- **WebCodecs encode path.** Implement mp4box.js demux → `VideoDecoder` →
  canvas scale/pad → `VideoEncoder` (`avc1.64002A`, falling back) →
  mp4-muxer. Once landed, swap the priority order in `pickEncoder()` so
  WebCodecs wins in "auto" mode.
- **AAC handling.** When WebCodecs `AudioEncoder` AAC is unavailable, decide
  whether to copy compatible audio or always fall through to ffmpeg.wasm.
- **Two-pass ffmpeg.wasm mode.** The local shell script does VBR 2-pass; v1
  here does single-pass. Wire a config flag and a second pass for parity.
- **WebGPU scaling.** `media/scaleCanvas.ts` has a Canvas2D contain-fit. A
  WebGPU path would offload the scale step from the main thread.
- **ZIP download for batches.** Each row has its own Download button; a
  "Download all" zip is in the spec for v1.5.
- **Offline-first single file.** Optionally embed `ffmpeg-core.wasm` itself
  as base64 so the click-and-run HTML works without internet on first use.
- **Configurable defaults via URL params** so instructors can pin a custom
  preset (`?vbitrate=12&res=1280x720`).
