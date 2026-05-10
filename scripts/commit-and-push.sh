#!/usr/bin/env bash
# scripts/commit-and-push.sh
#
# Quick "commit current state and push to origin" helper. Safe to re-run.
#
# Usage:
#   ./scripts/commit-and-push.sh                            # opens $EDITOR for the commit message
#   ./scripts/commit-and-push.sh "your commit message"      # uses the message you pass
#   ./scripts/commit-and-push.sh -m "msg" --no-verify       # extra args forwarded to git commit
#
# This script also clears stale lock/test files that the Cowork sandbox
# sometimes leaves behind in .git/ (the agent can write to .git but can't
# unlink, so on the host machine you may see leftover index.lock /
# test-write-<timestamp>). The cleanup is a no-op if nothing's there.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ---- preflight ------------------------------------------------------------

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "✗ not a git repo: $ROOT"
  exit 1
fi

# ---- cleanup --------------------------------------------------------------

# Stale lock files left by interrupted git ops (or by my sandboxed self).
# Empty 0-byte files; removing is always safe when nothing else is running.
LOCKS=(.git/index.lock .git/HEAD.lock .git/ORIG_HEAD.lock)
for f in "${LOCKS[@]}"; do
  if [[ -e "$f" ]]; then
    rm -f "$f" && echo "→ cleared $f"
  fi
done

# Stray sandbox test files. Naming pattern: .git/test-write-<unix-timestamp>.
# Harmless to git, but tidier without them.
shopt -s nullglob
for f in .git/test-write-*; do
  rm -f "$f" && echo "→ removed $f"
done
shopt -u nullglob

# ---- decide what to commit ------------------------------------------------

if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
  echo "→ nothing to commit; checking for unpushed commits"
  if [[ -n "$(git log @{u}.. 2>/dev/null)" ]]; then
    echo "→ pushing unpushed commits…"
    git push
    echo "✓ pushed."
  else
    echo "✓ nothing to do — working tree clean and up to date."
  fi
  exit 0
fi

echo "→ pending changes:"
git status -s

echo
echo "→ diff stat (vs HEAD):"
git diff --stat HEAD || true

# ---- commit + push --------------------------------------------------------

# Build commit args: if first positional is a non-flag, treat as message.
COMMIT_ARGS=()
if [[ $# -gt 0 && "$1" != -* ]]; then
  COMMIT_ARGS+=(-m "$1")
  shift
fi
COMMIT_ARGS+=("$@")  # forward any remaining flags (-m "..." --no-verify, etc.)

echo
echo "→ git add -A"
git add -A

echo "→ git commit ${COMMIT_ARGS[*]:-(opens editor)}"
git commit "${COMMIT_ARGS[@]}"

echo "→ git push"
git push

echo
echo "✓ Done."
echo "  Pages:    https://languel.github.io/videodoctool/"
echo "  Actions:  https://github.com/languel/videodoctool/actions"
echo "  Releases: https://github.com/languel/videodoctool/releases"
