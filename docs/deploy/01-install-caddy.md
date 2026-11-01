## 1. Install Caddy with the required modules

Rate limiting and the micro-cache are **Caddy modules**, not part of the
standard distribution. Install Caddy from its official apt repository first
(this provides the `caddy` user, `/etc/caddy`, `/var/lib/caddy` and the
systemd unit), then swap in a custom binary the way Caddy's documentation
describes (<https://caddyserver.com/docs/build>, "Package support files for
custom builds for Debian/Ubuntu/Raspbian").

```bash
# 1a. Caddy from the official repository. If these commands differ from the
#     current instructions at https://caddyserver.com/docs/install, follow those.
#     (Caddy's page also lists debian-keyring, debian-archive-keyring and
#     apt-transport-https; they are not needed to verify Caddy's repository.)
cd /tmp
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
               /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

```bash
# 1b. Build the custom binary as an unprivileged user (not root).
cd /tmp
sudo useradd -m -s /bin/bash vliegvuil || true   # also used in §2
sudo -u vliegvuil bash -c '
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
  cd ~ && ~/go/bin/xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/cache-handler \
    --with github.com/darkweak/storages/otter/caddy
'
```

The first-time build above is unpinned (latest). For every later rebuild use
`sudo scripts/vps-caddy-update.sh` instead: it builds with the pinned
versions from `scripts/caddy-versions.env` (the same set CI validates),
validates before installing, and restarts with rollback. If you ever build
by hand again, pin it (`xcaddy build <caddy-version> --with module@<version>`
from `scripts/caddy-versions.env`) and record the versions you deployed.

```bash
# 1c. Install it next to the packaged binary (official procedure).
sudo dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy
sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
sudo chown root:root /usr/bin/caddy.custom && sudo chmod 755 /usr/bin/caddy.custom
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50
sudo systemctl restart caddy
```

With this setup the packaged systemd unit keeps working unchanged and
`apt upgrade` can no longer overwrite the custom binary.

Modules used (three; confirm each licence in its repository before relying
on it):

- `mholt/caddy-ratelimit` — the `rate_limit` directive
  (<https://github.com/mholt/caddy-ratelimit>)
- `caddyserver/cache-handler` — the `cache` directive for the ~5s micro-cache
  (<https://github.com/caddyserver/cache-handler>). Since Souin v1.7.0 a
  storage module must be built in, hence `darkweak/storages/otter/caddy`
  (<https://github.com/darkweak/storages>).

Check the binary:

```bash
caddy version
caddy list-modules | grep -E 'ratelimit|cache'
```

