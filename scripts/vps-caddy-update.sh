#!/usr/bin/env bash
# VliegVuil.nl Caddy update: rebuild the custom Caddy binary, install the
# (possibly changed) Caddyfile, validate, and reload. Implements
# docs/deploy.md §9 "Caddy security updates" / the monthly rebuild, plus
# the Caddyfile part of §7. Run on the server with sudo rights.
#
# Usage: sudo scripts/vps-caddy-update.sh [repo-dir]
#   repo-dir defaults to /srv/vliegvuil
#
# Notes:
# - Builds @latest (no pinned versions), matching the documented
#   set-and-forget choice; versions are logged to /var/log/caddy-versions.log.
# - set -euo pipefail stops before the reload if the build or validation
#   fails, so a broken build cannot take down the running Caddy.
# - Reload (not restart) keeps the rate-limit state without dropping
#   connections.
set -euo pipefail

REPO_DIR="${1:-/srv/vliegvuil}"

cd /tmp   # sudo -u vliegvuil inherits the cwd; keep it neutral (deploy.md)

echo "== build custom Caddy (as vliegvuil) =="
sudo -u vliegvuil bash -c '
  set -e
  cd /tmp
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
  cd ~ && ~/go/bin/xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/cache-handler \
    --with github.com/darkweak/storages/otter/caddy
'

echo "== install new binary =="
sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
sudo chown root:root /usr/bin/caddy.custom
sudo chmod 755 /usr/bin/caddy.custom

echo "== install Caddyfile from the repo =="
sudo cp "$REPO_DIR/Caddyfile" /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile

echo "== validate (with the custom binary) =="
sudo /usr/bin/caddy.custom validate --config /etc/caddy/Caddyfile

echo "== reload =="
sudo systemctl reload caddy

echo "== record versions =="
echo "$(date -Is)  $(/usr/bin/caddy.custom version)" | sudo tee -a /var/log/caddy-versions.log

echo
caddy version
echo "Caddy updated, validated and reloaded."
echo "Optional header check: cd $REPO_DIR && scripts/verify-caddy-headers.sh \"\$(command -v caddy)\""
