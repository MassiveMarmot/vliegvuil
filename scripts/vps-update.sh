#!/usr/bin/env bash
# VliegVuil.nl VPS update: git pull, install deps, build the web app.
# Implements docs/deploy.md §7 (Updates). Run on the server as any user
# with sudo rights (sudo-rs on Ubuntu 26.04: no `sudo -H`, see the guide).
#
# Usage: sudo scripts/vps-update.sh [repo-dir]
#   repo-dir defaults to /srv/vliegvuil
#
# What it does NOT do: reload Caddy (use scripts/vps-caddy-update.sh for
# the Caddyfile and the custom Caddy binary) and any data jobs (the server
# never runs data refreshes, see docs/deploy.md §8).
set -euo pipefail

REPO_DIR="${1:-/srv/vliegvuil}"

cd /tmp   # sudo -u vliegvuil inherits the cwd; keep it neutral (deploy.md)

# The repo must be a clean checkout: git pull --ff-only fails otherwise,
# which is the signal that something edited tracked files on the server.
if ! sudo -u vliegvuil git -C "$REPO_DIR" diff-index --quiet HEAD --; then
  echo "ERROR: $REPO_DIR has local changes; 'git status' below." >&2
  sudo -u vliegvuil git -C "$REPO_DIR" status --short >&2 || true
  exit 1
fi

echo "== git pull =="
sudo -u vliegvuil git -C "$REPO_DIR" pull --ff-only

# If the pnpm pin changed, it must be reinstalled globally first (§3).
PINNED_PNPM="$(grep -o '"packageManager"[^,]*' "$REPO_DIR/package.json" | sed 's/.*pnpm@\([0-9.]*\).*/\1/')"
INSTALLED_PNPM="$(pnpm --version 2>/dev/null || echo none)"
if [ "$PINNED_PNPM" != "$INSTALLED_PNPM" ]; then
  echo "== pnpm pin changed ($INSTALLED_PNPM -> $PINNED_PNPM); reinstalling =="
  npm install -g "pnpm@$PINNED_PNPM"
fi

echo "== install + build (as vliegvuil) =="
sudo -u vliegvuil bash -c "
  set -e
  cd '$REPO_DIR'
  pnpm install --frozen-lockfile
  pnpm --filter web build
"

echo
echo "Update done. If this update changed the Caddyfile, now run:"
echo "  sudo scripts/vps-caddy-update.sh $REPO_DIR"
echo "Then check the site: curl -sSI https://vliegvuil.nl | head -20"
