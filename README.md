# Video Doc Tool

DDA video documentation compressor template — runs entirely in your browser.

**▸ Open the app:** **<https://languel.github.io/videodoctool/>**

Drop a video, click Export, download a class-ready MP4.

> **Note.** This targets the same delivery spec as the Adobe Media Encoder
> preset *"Vimeo 30 FPS High Quality 1080p HD DDA"*, but the browser
> encoder is not byte-for-byte identical to AME. Browser output may differ
> slightly. Use AME when you need exact parity for a final delivery; use
> this when you need a compatible-enough MP4 fast.

---

## How to use

1. Open <https://languel.github.io/videodoctool/> in **Chrome, Edge, or Firefox** on your computer.
2. Drag a video file (`.mp4` / `.mov` / `.webm` / `.mkv` / `.gif` / `.m4v`) into the dropzone, or click **Choose…**.
3. Click **Export**.
4. When the row turns and the **Exported** preview appears, click **Download**.

That's it. Multiple files at once: drop them all (or a folder), the queue
encodes them one at a time. Each file is an independent download.

### What you get

```
1920×1080 · 30 fps · H.264 (High @ L4.2) MP4
AAC stereo · 48 kHz · 320 kbps
~18 Mbps target  (max 20 Mbps)
+faststart  (moov box at the front)
```

Filename: `<original>_h264_show.mp4`

### Changing the preset

The default is correct for class delivery. To override for a one-off, click
the chevron on the **DDA doc preset** bar and adjust resolution, fps,
bitrate, etc. Click **reset** to return to the DDA defaults.

### Light / dark theme

Toggle in the top-right corner. Your choice persists across visits.

---

## Privacy

Everything happens in your browser tab. The first time you encode in a
session, the page downloads ~32 MB of WebAssembly (`ffmpeg-core`) from a
CDN — that's the entirety of the network activity. Your video files
**never leave your computer**.

The page itself is ~40 KB. After the wasm is cached, you can disconnect
from the network and keep encoding.

---

## Browser support

| Browser              | Status                                       |
| -------------------- | -------------------------------------------- |
| Chrome / Edge        | ✅ recommended                               |
| Firefox              | ✅                                           |
| Safari               | ⚠️ partial — works but less thoroughly tested |

If something doesn't work in your browser, try Chrome or Firefox.

---

## Troubleshooting

**Stuck at 0%?** Open the developer console (Cmd+Opt+I → Console). The
encoder logs `[ffmpeg stderr]` lines when it's running; if you see those,
the encode is in progress (long videos take a while). If you see a red
error message, copy it into a GitHub issue.

**`Refused to cross-origin redirects of the top-level worker script`?**
Hard-reload the page (Cmd+Shift+R). This was a bug in earlier versions; the
current build sidesteps it.

**Output file is 0 bytes?** Almost always a container/codec edge case
ffmpeg.wasm couldn't handle. Try opening the source in QuickTime, exporting
as `.mp4`, then re-running. Or use Adobe Media Encoder for that file.

**Long videos OOM the tab?** ffmpeg.wasm holds the whole file in memory.
For inputs over ~5 minutes at 4K source, prefer the local shell script in
`dda_video_template_compress.sh`.

---

## Image sequences

The app accepts folders of PNG/JPG/etc. and groups them into "image
sequence" rows. **Encoding image sequences is not yet implemented** — the
row will show in the queue but Export will report it as unsupported. For
image-sequence delivery, use Adobe Media Encoder. (Tracked as a TODO.)

---

## Standalone download

Each release also publishes a zipped single-HTML file you can keep locally
and double-click anywhere — no internet required after the first encode
caches the wasm.

**▸ [Download `videodoctool.zip`](https://github.com/languel/videodoctool/releases/latest/download/videodoctool.zip)** ([all releases](https://github.com/languel/videodoctool/releases))

---

## For developers

See **[BUILD.md](BUILD.md)** for build setup, dev server, architecture, and
the bug log from the initial port.
