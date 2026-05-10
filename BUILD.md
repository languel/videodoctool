# Build & development notes

How the app is built, the architecture inside, and the gnarly bugs that
were caught and fixed during the initial port. Audience is "someone who
has the repo open and wants to change something."

For end-user/student usage, see [README.md](README.md).

---

## Quick start

```sh
git clone https://github.com/languel/videodoctool.git
cd videodoctool
npm install
npm run build              # produces dist/videodoctool.html
open dist/videodoctool.html
```

For development with auto-rebuild + a dev server that has cross-origin
isolation headers (so ffmpeg.wasm runs multi-threaded):

```sh
npm run dev                # http://127.0.0.1:5173
```

Type-check only:

```sh
npm run typecheck          # tsc --noEmit
```

---

## Project layout

```
index.html                   # template — script/style placeholders are
                             # inlined at build time
scripts/
  build.mjs                  # esbuild bundle + single-file HTML emitter
  publish.sh                 # one-shot gh-CLI repo + Pages bootstrapper
  worker-src/
    ffmpeg-worker.js         # custom ffmpeg.wasm worker (replaces the
                             # one shipped by @ffmpeg/ffmpeg, see below)
src/
  main.ts
  app.ts                     # orchestration: drop → queue → encode → preview
  styles.css                 # tokens + components for both themes
  encoders/
    types.ts                 # Encoder interface + DDA_PRESET
    ffmpegWasmEncoder.ts     # primary v1 encoder + MiniFFmpeg wrapper
    webcodecsEncoder.ts      # support detection + stub for the WebCodecs path
  media/
    fileInput.ts             # drag/drop + folder walking + extension filter
    metadata.ts              # duration / dimensions probe via <video>
    preview.ts               # original-vs-encoded preview helper
    scaleCanvas.ts           # contain-fit math (letterbox / pillarbox)
    mux.ts                   # mp4-muxer integration (stub for WebCodecs path)
  ui/
    dropzone.ts
    queue.ts                 # per-item rows + inline preview pane
    progress.ts              # overall N/M + spinner
    presetPanel.ts           # collapsible preset editor
    themeToggle.ts           # localStorage["sc.theme"]
  utils/
    time.ts
    formatBytes.ts
    support.ts               # feature detection + H.264 codec candidates
.github/
  workflows/
    deploy.yml               # build → Pages → release on push to main
```

---

## Build system

Pure esbuild (no Vite, no Rollup). The build is a single Node script:

`scripts/build.mjs`

1. Bundle `src/main.ts` to a single IIFE JS string.
2. Bundle `scripts/worker-src/ffmpeg-worker.js` to a separate IIFE string —
   this is the ffmpeg.wasm message-handler worker.
3. Read `index.html` and `src/styles.css`.
4. Splice the worker source into a `window.__DDA_FFMPEG_WORKER_SRC` global
   in a leading `<script>`, then inline the CSS into a `<style>` and the
   app JS into a second `<script>`, replacing the placeholder `<link>` and
   `<script>` tags in the template.
5. Write `dist/videodoctool.html`.

CLI:

- `node scripts/build.mjs` — one-shot production build.
- `node scripts/build.mjs --watch --serve` — rebuild on file changes,
  serve at `http://127.0.0.1:5173` with `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so
  `SharedArrayBuffer` is available and ffmpeg.wasm can run multi-threaded.

`npm run build` and `npm run dev` are thin aliases.

The output is a self-contained ~40 KB HTML file. The first time the user
encodes anything, the page fetches ~32 MB of `@ffmpeg/core` (wasm + bootstrap
JS) from `unpkg.com` and caches it as a Blob URL. After that, encoding is
offline-capable for the rest of the browser session.

---

## Encoder pipeline

The UI talks to a single `Encoder` interface (`src/encoders/types.ts`):

```ts
interface Encoder {
  id: "webcodecs" | "ffmpeg-wasm";
  isSupported(settings): Promise<boolean>;
  encode(job): Promise<EncodeResult>;
}
```

Two implementations:

### `ffmpeg-wasm` (primary, working)

Lives in `src/encoders/ffmpegWasmEncoder.ts`. The flow:

1. Main thread fetches `ffmpeg-core.js` (text) and `ffmpeg-core.wasm`
   (bytes) from unpkg's CDN.
2. The custom worker is constructed from a same-origin blob URL built from
   `window.__DDA_FFMPEG_WORKER_SRC`.
3. Main thread sends those bytes to the worker via `postMessage` with
   `transfer` so the wasm Uint8Array isn't copied.
4. Inside the worker (`scripts/worker-src/ffmpeg-worker.js`):
   - Build a same-realm blob URL from the JS string.
   - `await import(blobURL)` to pull in `createFFmpegCore`.
   - `createFFmpegCore({ wasmBinary, mainScriptUrlOrBlob })` — `wasmBinary`
     means ffmpeg-core skips its own wasm fetch.
   - Register message handlers for EXEC / WRITE_FILE / READ_FILE /
     DELETE_FILE / LOG / PROGRESS.
5. Main thread issues `LOAD`, then `WRITE_FILE`, then `EXEC` with the argv,
   then `READ_FILE`, returns the encoded MP4 as a Blob.

ffmpeg invocation mirrors the local shell script
`dda_video_template_compress.sh`, but single-pass instead of two-pass for
speed. See `buildFFmpegArgs()`.

### `webcodecs` (TODO — detection only)

`src/encoders/webcodecsEncoder.ts` probes `VideoEncoder.isConfigSupported`
and `AudioEncoder.isConfigSupported` for H.264 + AAC. The encode method
throws — the actual pipeline (mp4box.js demux → VideoDecoder →
canvas scale/pad → VideoEncoder → mp4-muxer) is not yet implemented. When
it is, `pickEncoder("auto")` should prefer it.

---

## Bugs caught during development

These are notes for future maintainers. The "obvious thing" wasn't always
the right thing.

### `String.prototype.replace` substitution patterns

`replace(regex, "...")` interprets `$&`, `$'`, `` $` ``, and `$<n>` in the
replacement string. Minified JS often contains those byte sequences as
identifiers. Substituting JS into HTML via `replace(re, jsText)` silently
corrupts the bundle by inserting the original matched HTML at those
positions. Use the **function form** (`replace(re, () => jsText)`) to take
the replacement literally. Both calls in `build.mjs` use the function
form.

### Cross-origin worker scripts from null origin

`@ffmpeg/ffmpeg`'s default worker construction is
`new Worker(new URL("./worker.js", import.meta.url))`. When the page is at
a `null` origin (which is what `file://` resolves to in Chrome), the
browser refuses cross-origin worker top-level scripts entirely — the
worker won't even start.

Fix: construct the worker from a same-origin **`blob:` URL** built from
inlined source. We bundle our own worker (`scripts/worker-src/ffmpeg-worker.js`),
and construct it as a classic worker (see next note).

### Module workers from blob URLs on null origin

Even with a same-origin `blob:` URL, Chromium applies a stricter
"top-level worker script cross-origin redirect" check on **module**
workers from a null-origin page. The error reads `Refused to cross-origin
redirects of the top-level worker script.` even though no redirect is
actually happening.

Fix: construct as a **classic worker** (`new Worker(blobUrl)` with no
`{ type: "module" }`). Our worker code only uses dynamic `import()`
(allowed in classic workers on modern browsers), so module mode wasn't
needed.

### Cross-realm blob URLs

A blob URL created in the main thread and handed to the worker via
`postMessage` was being treated as a cross-origin asset by the worker's
own module loader. Fix: send raw bytes/text to the worker via
`postMessage`, and let the worker construct its own blob URLs in its own
realm.

### Headless Chromium quirk

`chromium-headless-shell` (Playwright's default lightweight Chromium build)
**cannot run module workers from blob URLs at all**. Real Chrome and
Firefox handle them fine. Don't trust headless Chromium results to
validate this code path; use Firefox headless or real Chrome.

---

## GitHub Pages deployment

Auto-deploy on push to `main` via `.github/workflows/deploy.yml`:

1. `npm ci` + `npm run build`.
2. Copy `dist/videodoctool.html` → `_site/index.html`.
3. Zip `videodoctool.html` → `_release/videodoctool.zip`.
4. Upload `_site` as the Pages artifact, deploy via `actions/deploy-pages@v4`.
5. Update the rolling **`latest`** release with `videodoctool.zip` (creates
   the release on first run; uses `gh release upload --clobber` after).

Stable URLs:

- App: `https://languel.github.io/videodoctool/`
- Latest zipped HTML: `https://github.com/languel/videodoctool/releases/latest/download/videodoctool.zip`

The bootstrap script `scripts/publish.sh` handles initial repo creation +
Pages enablement (it's idempotent — safe to re-run).

---

## TODO

- **WebCodecs encode path.** Implement mp4box.js demux → `VideoDecoder` →
  canvas scale/pad → `VideoEncoder` (`avc1.64002A` first, falling back) →
  mp4-muxer. Once landed, swap the priority order in `pickEncoder()` so
  WebCodecs wins in "auto" mode.
- **Image sequence encoding.** Currently the UI accepts and groups image
  sequences but Export throws "image sequence encoding coming soon". Wire
  ffmpeg's concat demuxer or `frame_%04d.png` pattern through the encoder.
- **AAC handling for the WebCodecs path.** When `AudioEncoder` AAC is
  unavailable, decide between copying compatible audio or always falling
  through to ffmpeg.wasm.
- **Two-pass ffmpeg.wasm mode.** The shell script does VBR 2-pass; v1 here
  does single-pass. Wire a flag and a second pass for parity.
- **WebGPU scaling.** `media/scaleCanvas.ts` has Canvas2D contain-fit. A
  WebGPU path would offload scaling from the main thread.
- **Offline-first single file.** Optionally embed `ffmpeg-core.wasm` itself
  as base64 so the click-and-run HTML works without internet on first use.
  Trade-off: HTML grows from ~40 KB to ~32 MB.
- **Configurable defaults via URL params** so instructors can pin a custom
  preset (`?vbitrate=12&res=1280x720`).
