# Polish + Publish Plan

A step-by-step plan to (1) redesign the UI in Anthropic's visual language and
(2) deploy the single-file HTML to GitHub Pages with auto-build on push.

---

## Part 1 — Visual redesign in Claude / Anthropic style

The current UI is a competent dark theme. To match Anthropic's warm,
paper-like aesthetic the changes are mostly in `src/styles.css` and a small
typography update in `index.html`.

### 1.1 Color tokens

Replace the `:root { --bg, --panel, ... }` block at the top of
`src/styles.css` with the warm palette below. These match Anthropic's
public marketing site within a reasonable tolerance — they're not official
brand assets, so don't claim they are.

```css
:root {
  /* Warm paper background, slightly off-white */
  --bg:           #faf9f5;
  --panel:        #ffffff;
  --panel-2:      #f3f1ea;
  --border:       #e6e2d6;

  /* Ink (text) — near-black with a hint of warmth */
  --text:         #1a1a19;
  --muted:        #6b6960;

  /* Anthropic-style rust/orange accent */
  --accent:       #d97757;        /* primary action */
  --accent-strong:#bf5d3d;        /* hover / active */
  --accent-soft:  #fbe7dc;        /* tinted background */

  --success:      #5a7d49;
  --warn:         #b67a2c;
  --error:        #b73e2f;

  --mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --serif: "Tiempos Headline", "Source Serif Pro", "Charter", "Georgia", serif;
}
```

### 1.2 Typography

Anthropic uses a custom serif (Tiempos) for headlines and a custom sans
(Styrene) for body. Tiempos and Styrene are licensed; substitute with
free serif-style fallbacks. For the cleanest result without paying for
fonts, use Inter (body) + Source Serif Pro (headings) via Google Fonts —
or just use the system stack already in `--sans`.

In `index.html`'s `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
```

Note: this adds an external HTTP request at first load. For a true offline
single-file build, skip the Google Fonts link and rely on system fonts —
the `--sans` and `--serif` stacks already fall back gracefully.

### 1.3 Component-level updates in `src/styles.css`

The structural CSS doesn't need much. Only these adjustments:

```css
.hero h1 {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 36px;       /* was 28 */
  letter-spacing: -0.02em;
}

.preset-box {
  background: var(--accent-soft);
  border-color: rgba(217, 119, 87, 0.25);
}

.preset-title {
  color: var(--accent-strong);
}

.dropzone {
  border-color: rgba(217, 119, 87, 0.35);
  background: var(--panel);
}

.dropzone:focus-visible,
.dropzone:hover,
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dropzone-icon { color: var(--accent); }

button.primary,
.controls #btn-start,
.download-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;             /* was dark on cyan; now white on rust */
}

button.primary:hover:not(:disabled),
.controls #btn-start:hover:not(:disabled),
.download-btn:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}

.queue-item.is-encoding .qi-spinner,
.qi-bar-fill {
  color: var(--accent);
  background: var(--accent);
}
```

### 1.4 Spacing + radii

Anthropic's design uses generous breathing room. Bump these:

```css
#app { padding: 48px 32px 96px; }     /* was 28/24/64 */
.preset-box, .settings, .queue,
.preview-pane { border-radius: 14px; padding: 18px 22px; }
.dropzone { border-radius: 18px; padding: 56px 16px; }
```

### 1.5 Optional: subtle card shadows

```css
.preset-box, .settings, .queue, .dropzone, .preview-pane {
  box-shadow: 0 1px 0 rgba(15, 14, 10, 0.04),
              0 8px 24px -16px rgba(15, 14, 10, 0.08);
}
```

### 1.6 Quick-win copy tweaks

These small wording changes lean into the Anthropic friendly-but-honest
tone. Edit `index.html`:

| Field            | From                                                                | To                                                                       |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Subtitle         | Export student videos as 1080p · 30fps · H.264 MP4 · AAC audio.     | Export your videos to the class delivery format — locally, in the browser. |
| Preset note      | Files stay on your computer. Nothing is uploaded.                   | Your files never leave your computer. Encoding happens in this browser tab. |
| Disclaimer       | Matches the class delivery spec; browser encoding may differ slightly from Adobe Media Encoder. | Targets the same delivery spec as Adobe Media Encoder's preset; output may differ slightly. |

---

## Part 2 — Repo cleanup before publishing

### 2.1 Add a license

Create `LICENSE` (MIT is a good default):

```
MIT License

Copyright (c) 2026 [your name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2.2 Confirm `.gitignore`

It already covers `node_modules`, `dist`, `.vite`, `.env*`. Nothing to do.

### 2.3 README polish

Add a screenshot at the top (drop a 1200×800 PNG of the app at
`docs/screenshot.png`, then `![](docs/screenshot.png)`).

Add a **Live demo** link near the top, e.g.
`[Try it →](https://YOUR_GH_USERNAME.github.io/dda-h264-show-compressor/)`

### 2.4 Optional: rename the project

If you want a friendlier name on the URL, change `name` in `package.json`
and the `<title>` in `index.html`. Pick something like
`dda-show-compressor` or `class-video-compressor`.

---

## Part 3 — GitHub Pages with auto-build

### 3.1 Initial repo setup (one-time)

If the project isn't already on GitHub:

```sh
cd /Users/liuboto/dev/teaching/videodoctool
git init
git add -A
git commit -m "Initial commit: DDA H.264 Show Compressor"
gh repo create dda-h264-show-compressor --public --source=. --push
# (or do it manually: create repo on github.com, then:
#  git remote add origin git@github.com:YOU/REPO.git
#  git branch -M main
#  git push -u origin main)
```

### 3.2 Enable GitHub Pages with Actions

In the repo on github.com:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

(Don't pick "Deploy from a branch" — we want Actions to handle it.)

### 3.3 Add the workflow file

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Stage site
        # GitHub Pages needs an index.html at the root of what it serves.
        run: |
          mkdir -p _site
          cp dist/dda-compressor.html _site/index.html
          # Optional: copy a screenshot or favicon if you add them
          # cp -r docs/screenshot.png _site/

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Commit and push:

```sh
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deploy workflow"
git push
```

The first push triggers the workflow. After ~1 minute the site is live at:

```
https://YOUR_GH_USERNAME.github.io/REPO_NAME/
```

(Find the exact URL in the Actions run summary, or in Settings → Pages.)

### 3.4 Custom domain (optional)

If you have a domain:

1. Settings → Pages → Custom domain → enter `compressor.example.com`.
2. At your DNS provider, add a `CNAME` record:
   `compressor.example.com  →  YOUR_GH_USERNAME.github.io`
3. Wait for DNS to propagate, then check **Enforce HTTPS** in Pages settings.

The workflow doesn't need any changes for a custom domain.

---

## Part 4 — Caveats specific to GitHub Pages hosting

### 4.1 No COOP/COEP headers

GitHub Pages can't set custom response headers. That means the page **will
not be cross-origin isolated** and `SharedArrayBuffer` won't be available.
Result: ffmpeg.wasm runs single-threaded only. This is the same situation
as opening the file from `file://`. Encoding still works; it's just slower
than the dev-server multi-thread path.

**No code change needed** — `supportsMultithread()` already returns false
when `crossOriginIsolated` is false, and the encoder picks the right core.

### 4.2 First load downloads ~32 MB

`ffmpeg-core.wasm` is fetched from unpkg on the user's first encode (in
their browser session). After that it's served from the browser's HTTP
cache, so subsequent encodes start instantly.

If you want first-encode-instant: in `scripts/build.mjs`, fetch the wasm
at build time and inline it as a base64 data URL or Uint8Array literal in
the bundle. The HTML grows from ~38 KB to ~43 MB (huge but
self-contained). Probably not worth it for class use.

### 4.3 Cross-origin fetches from null origin

When users open the file with `file://` (after downloading the HTML
directly), the page is null origin. We hit unpkg via `fetch` from main
thread — unpkg sends `Access-Control-Allow-Origin: *`, so this works.

When served from GitHub Pages (https origin), the same fetch works for
the standard CORS reason. No code change.

---

## Part 5 — A short pre-publish checklist

- [ ] Apply visual changes (Part 1).
- [ ] `npm run build` and double-check `dist/dda-compressor.html` opens cleanly.
- [ ] Drop a real student video, encode end-to-end, confirm download works.
- [ ] Add LICENSE.
- [ ] README has working live-demo link and screenshot.
- [ ] Push to GitHub.
- [ ] Enable Pages → Source: GitHub Actions.
- [ ] Confirm Actions run succeeds and the Pages URL serves the page.
- [ ] Open the live URL in an incognito window and run an encode end-to-end.

---

## Part 6 — Things to consider later (not blocking)

- **Service worker** so the app loads offline after the first visit.
- **PWA manifest** for "Install app" on Chrome/Edge.
- **WebCodecs encoder path** (the TODO in README): much faster than
  ffmpeg.wasm when supported.
- **ZIP download** for batch encodes.
- **URL-param presets** so an instructor can hand out a link with
  pre-loaded settings, e.g. `?vbitrate=12&res=1280x720&fps=24`.
- **Dark mode** — the current dark theme as a `prefers-color-scheme: dark`
  override on top of the new light theme.
