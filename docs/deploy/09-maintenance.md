## 9. Maintenance

- **Caddy security updates.** `apt upgrade` updates only the packaged binary
  (`/usr/bin/caddy.default`); the custom one is **not** updated. Watch
  Caddy's releases, and at least monthly rebuild with the repo script:

  ```bash
  cd /srv/vliegvuil && git pull --ff-only
  sudo scripts/vps-caddy-update.sh
  ```

  The script (in the repo, so it is versioned and CI-checked alongside the
  Caddyfile it installs) builds the custom binary with the SAME pinned
  versions the `validate-caddyfile` CI job uses, and never leaves a broken
  state:

  1. Sources `scripts/caddy-versions.env` — the single source of truth for
     the pins (Caddy v2.11.7, xcaddy v0.4.7, caddy-ratelimit v0.1.0,
     cache-handler v0.17.0, storages/otter v0.0.20), read by both the script
     and `.github/workflows/ci.yml`.
  2. Creates **two temp directories**: a vliegvuil-owned build dir and a
     root-owned work dir (mode 700) — the build runs unprivileged in its
     own dir, and only root copies the finished binary into the work dir.
     A pre-flight check verifies vliegvuil can write to the build dir
     BEFORE the multi-minute build starts.
  3. Builds to the **build dir** (nothing installed yet); root installs the
     binary copy into the root-owned work dir and removes the build copy.
  4. **Validates the new binary against the repo Caddyfile in the work
     dir** — a failed validate aborts before anything is installed.
  5. Backs up the current binary and Caddyfile.
  6. Installs both, then runs `systemctl restart caddy` — a restart, NOT a
     reload: SIGHUP re-reads the Caddyfile but does not swap the running
     binary, so a reload would leave the new build inactive until the next
     restart. The restart briefly drops open connections (a second or two);
     this is NOT zero downtime.
  7. Post-restart check: if caddy is not active, restores the backups,
     restarts again and tells you to investigate if the rollback also fails.

  Both temp directories are removed by an EXIT trap that preserves the
  script's exit status, on success and on failure.

  Each run appends a timestamped `caddy version` line to
  `/var/log/caddy-versions.log` — the record of deployed versions.

  Troubleshooting:

  - `caddy: go build caddy: copying /tmp/go-build.../a.out: open
    /tmp/caddy-build.../caddy.custom.new: permission denied` — the build
    output directory was not writable by `vliegvuil`. This was a real
    failure (observed 2026-10): the script used to hand the unprivileged
    build a root-owned `mktemp` dir (mode 700), so the whole compile
    succeeded and only the final copy failed. The two-directory fix and
    the pre-flight write check above make this impossible; if you still
    see it, check that `sudo -u vliegvuil mktemp -d /tmp/caddy-build.XXXXXX`
    succeeds and that no older script version is being run.

  Notes:

  - `set -euo pipefail` stops at the first failure; because validation runs
    BEFORE anything is installed, a broken build or a failed validate never
    touches the running Caddy.
  - **Pins are the single source of truth.** `scripts/caddy-versions.env` is
    read by BOTH this script and the `validate-caddyfile` CI job (which also
    fails the build when `caddy fmt --diff` would change the Caddyfile).
    When you bump a pin, do it in that one file, in the same PR rebuild the
    VPS binary (`sudo scripts/vps-caddy-update.sh`) — the pins, the
    CI-validated set and the deployed binary always move together.
  - xcaddy itself is pinned too (v0.4.7): the build tool reproduces what CI
    used, not whatever `@latest` ships that day.
  - This is a small piece of infrastructure you own: keep it simple, and
    update it in the same sitting whenever the module set or paths change.
- **Version-lag check.** `apt upgrade` updates `/usr/bin/caddy.default`
  only, so the packaged and custom binaries can drift. To see how far:
  ```bash
  caddy version
  /usr/bin/caddy.default version
  caddy list-modules | grep -E 'rate_limit|cache|otter'
  ```
  `caddy` resolves through `update-alternatives` to the custom binary;
  `caddy list-modules` tells stock from custom in one glance (the custom
  build lists `rate_limit`, `cache` and `otter`; a stock binary does not).
  If `caddy.default` reports a newer version than the custom binary, run
  `sudo scripts/vps-caddy-update.sh` to rebuild the custom binary from the
  repo with the pinned versions (it also re-copies the Caddyfile, validates
  before installing, restarts, and rolls back if the restart check fails).
- **Do not `apt-mark hold caddy`.** The apt package must keep updating:
  it delivers `caddy.default` and Caddy's systemd service files, which the
  custom binary does not replace. The custom binary is updated by the
  script above, not by apt, so holding the package would only freeze the
  fallback binary and the service definitions, defeating the point of
  having both.
- **Reading memory usage.** Judge memory by the `available` column of
  `free -h` (`MemAvailable`), not by `used` or `free`. Linux fills spare RAM
  with reclaimable page cache by design, so a 4 GB VPS that shows only a few
  hundred MB "free" is healthy, not leaking. The long-running processes are
  Caddy and little else; a high `buff/cache` value is expected. Use
  `systemctl status caddy` / `ps -o rss= -C caddy` if you want the actual
  Caddy RSS.
- **Optional: cap Caddy's Go heap.** As a safety net against a future cache
  or module regression growing the Go heap, you can give Caddy a soft memory
  limit with a systemd drop-in. It is not needed today (measured Caddy RSS
  is tens of MB); add it only if you want the guarantee:
  ```bash
  sudo mkdir -p /etc/systemd/system/caddy.service.d
  sudo tee /etc/systemd/system/caddy.service.d/90-gomemlimit.conf >/dev/null <<'CONF'
  [Service]
  Environment=GOMEMLIMIT=1GiB
  CONF
  sudo systemctl daemon-reload
  sudo systemctl restart caddy
  ```
  `GOMEMLIMIT` is a soft limit: the Go garbage collector runs harder as the
  heap approaches it instead of letting it grow without bounds. Pick a
  value well below the VPS RAM (1 GiB on the 4 GB VPS leaves ample room for
  page cache and peaks); if Caddy ever needs more, raise it or remove the
  drop-in.
- **System updates.** Unattended upgrades handle security patches. After
  kernel updates, reboot when `/var/run/reboot-required` exists.
- **Node, Go and pnpm.** Keep Node in line with CI (Node 22), pnpm with the
  `packageManager` pin, and Go with what `xcaddy` needs.
- **State and backups.** The only state on the server is Caddy's TLS data in
  `/var/lib/caddy`, which Caddy recreates on its own. Everything else can be
  rebuilt from git, so the server is disposable: if it breaks, reinstall and
  follow this guide from the top.

