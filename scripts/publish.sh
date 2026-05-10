#!/usr/bin/env bash
# scripts/publish.sh
#
# One-shot setup: create the GitHub repo, push, enable Pages.
# Idempotent — safe to re-run; later runs just push commits.
#
# Requires: gh (https://cli.github.com), authenticated against the target account.

set -euo pipefail

REPO="languel/videodoctool"
DESC="Browser-only video compressor for student MP4/MOV submissions. Targets the DDA doc preset (1080p · 30 fps · H.264 · AAC). Drop a file, hit Export, download the result — encoding happens locally."

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "→ project root: $ROOT"

# ---- preflight ------------------------------------------------------------

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh CLI not installed. Install with:  brew install gh"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh not authenticated. Run:  gh auth login"
  exit 1
fi

WHOAMI="$(gh api user --jq .login 2>/dev/null || echo '')"
EXPECTED_OWNER="${REPO%%/*}"
if [[ -n "$WHOAMI" && "$WHOAMI" != "$EXPECTED_OWNER" ]]; then
  echo "⚠  gh is authed as '$WHOAMI' but repo target is '$EXPECTED_OWNER'."
  echo "   Continuing — gh will create the repo under whichever account it can."
fi

# Tidy: leftover Vite timestamp files, .DS_Store. Harmless to leave but ugly.
rm -f "$ROOT"/vite.config.ts.timestamp-*.mjs 2>/dev/null || true
rm -f "$ROOT"/vite.config.ts 2>/dev/null || true     # truly unused now
find "$ROOT" -name '.DS_Store' -delete 2>/dev/null || true

# ---- git init / commit ----------------------------------------------------

if [[ ! -d .git ]]; then
  echo "→ git init"
  git init -b main
fi

# Make sure user.name / user.email are set; gh-cli's git uses local config first.
if ! git config user.email >/dev/null; then
  EMAIL="$(gh api user --jq '.email // empty' 2>/dev/null || true)"
  NAME="$(gh api user --jq '.name // .login' 2>/dev/null || true)"
  if [[ -z "$EMAIL" ]]; then
    EMAIL="${WHOAMI}@users.noreply.github.com"
  fi
  git config user.email "$EMAIL"
  git config user.name "${NAME:-$WHOAMI}"
  echo "→ set local git identity to: $NAME <$EMAIL>"
fi

git add -A

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if ! git diff --cached --quiet; then
    echo "→ committing changes"
    git commit -m "video doc tool — design refresh" >/dev/null
  else
    echo "→ no new changes to commit"
  fi
else
  echo "→ initial commit"
  git commit -m "video doc tool — initial publish" >/dev/null
fi

# ---- create repo + push ---------------------------------------------------

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "→ repo $REPO already exists; pushing"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$REPO.git"
  fi
  git push -u origin main
else
  echo "→ creating GitHub repo $REPO"
  gh repo create "$REPO" \
    --public \
    --description "$DESC" \
    --source=. \
    --push \
    --remote=origin
fi

# ---- enable Pages with workflow source ------------------------------------

echo "→ enabling GitHub Pages (source: GitHub Actions)"
# Try POST (create) first; if Pages already exists, update via PUT.
if gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
  echo "  Pages enabled."
elif gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
  echo "  Pages updated to workflow source."
else
  echo "  (Pages call returned non-zero — may already be configured. Continuing.)"
fi

# ---- done -----------------------------------------------------------------

OWNER="${REPO%%/*}"
NAME_PART="${REPO##*/}"
echo
echo "✓ Pushed to https://github.com/$REPO"
echo "→ Workflow runs:   https://github.com/$REPO/actions"
echo "→ Pages settings:  https://github.com/$REPO/settings/pages"
echo "→ Live URL (after first deploy completes):"
echo "    https://$OWNER.github.io/$NAME_PART/"
echo
echo "First deploy usually takes 30–90 seconds. Watch the Actions tab."
