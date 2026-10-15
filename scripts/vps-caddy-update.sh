#!/usr/bin/env bash
# VliegVuil.nl Caddy update: rebuild the custom Caddy binary with the SAME
# pinned versions CI validates (.github/workflows/ci.yml validate-caddyfile;
# both read scripts/caddy-versions.env), validate the new binary against
# the repo Caddyfile BEFORE installing anything, back up the current binary
# and Caddyfile, install, restart, and roll back from the backup if the
# post-restart check fails. Implements docs/deploy.md §9 "Caddy security
# updates" / the monthly rebuild, plus the Caddyfile part of §7.
#
# Usage: sudo scripts/vps-caddy-update.sh [repo-dir]
#   repo-dir defaults to /srv/vliegvuil
#
# Restart, not reload: `systemctl reload caddy` sends SIGHUP, which re-reads
# the Caddyfile but does NOT swap the running binary — the new build would
# not be active until the next restart. A restart briefly drops open
# connections (a second or two); this script does NOT claim zero downtime.
set -euo pipefail

REPO_DIR="${1:-/srv/vliegvuil}"
VERSIONS_FILE="$REPO_DIR/scripts/caddy-versions.env"
BINARY_DEST=/usr/bin/caddy.custom
CADDYFILE_DEST=/etc/caddy/Caddyfile
LOG_FILE=/var/log/caddy-versions.log

# shellcheck source=scripts/caddy-versions.env
. "$VERSIONS_FILE"

WORKDIR="$(mktemp -d /tmp/caddy-update.XXXXXX)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "== build custom Caddy ${CADDY_VERSION} (as vliegvuil, xcaddy ${XCADDY_VERSION}) =="
# sudo -u vliegvuil inherits the cwd; keep it neutral (deploy.md). Build to
# a temp path so a failed build cannot leave a half-written artifact in ~.
# sudo strips the environment by default (env_reset), so pass the pinned
# versions and temp path explicitly on the sudo command line instead of
# relying on exports.
sudo -u vliegvuil \
  XCADDY_VERSION="$XCADDY_VERSION" \
  CADDY_VERSION="$CADDY_VERSION" \
  CADDY_RATELIMIT_VERSION="$CADDY_RATELIMIT_VERSION" \
  CADDY_CACHE_HANDLER_VERSION="$CADDY_CACHE_HANDLER_VERSION" \
  CADDY_OTTER_VERSION="$CADDY_OTTER_VERSION" \
  WORKDIR="$WORKDIR" \
  bash -c '
  set -e
  cd /tmp
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@$XCADDY_VERSION
  cd ~ && ~/go/bin/xcaddy build "$CADDY_VERSION" \
    --with github.com/mholt/caddy-ratelimit@$CADDY_RATELIMIT_VERSION \
    --with github.com/caddyserver/cache-handler@$CADDY_CACHE_HANDLER_VERSION \
    --with github.com/darkweak/storages/otter/caddy@$CADDY_OTTER_VERSION \
    --output "$WORKDIR/caddy.custom.new"
'
sudo chown root:root "$WORKDIR/caddy.custom.new"
sudo chmod 755 "$WORKDIR/caddy.custom.new"

echo "== validate the new binary against the repo Caddyfile (nothing installed yet) =="
sudo cp "$REPO_DIR/Caddyfile" "$WORKDIR/Caddyfile.new"
# The repo Caddyfile imports no absolute paths (verified by inspection), but
# validate in the temp dir anyway so a future import cannot resolve against
# the live tree.
sudo "$WORKDIR/caddy.custom.new" validate --config "$WORKDIR/Caddyfile.new"

echo "== back up the current binary and Caddyfile =="
sudo cp -a "$BINARY_DEST" "$WORKDIR/caddy.custom.bak"
sudo cp -a "$CADDYFILE_DEST" "$WORKDIR/Caddyfile.bak"

echo "== install =="
sudo install -o root -g root -m 755 "$WORKDIR/caddy.custom.new" "$BINARY_DEST"
sudo install -o root -g root -m 644 "$WORKDIR/Caddyfile.new" "$CADDYFILE_DEST"

echo "== restart (brief connection drop expected) =="
# Restart swaps the running binary; reload does not (see header comment).
sudo systemctl restart caddy
sleep 2

echo "== post-restart check =="
if ! sudo systemctl is-active --quiet caddy; then
  echo "!! caddy is not active after the restart — rolling back" >&2
  sudo install -o root -g root -m 755 "$WORKDIR/caddy.custom.bak" "$BINARY_DEST"
  sudo install -o root -g root -m 644 "$WORKDIR/Caddyfile.bak" "$CADDYFILE_DEST"
  sudo systemctl restart caddy
  sleep 2
  if sudo systemctl is-active --quiet caddy; then
    echo "Rolled back to the previous binary and Caddyfile; caddy is active." >&2
  else
    echo "!! Rollback finished but caddy is STILL not active — investigate manually:" >&2
    echo "   systemctl status caddy --no-pager && journalctl -u caddy -n 50 --no-pager" >&2
  fi
  exit 1
fi

echo "== record versions =="
echo "$(date -Is)  $(/usr/bin/caddy.custom version)" | sudo tee -a "$LOG_FILE"
echo
caddy version
echo "Caddy updated, validated and restarted (pinned to the CI-validated versions)."
echo "Optional header check: cd $REPO_DIR && scripts/verify-caddy-headers.sh \"\$(command -v caddy)\""
