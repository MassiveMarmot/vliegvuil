## 7. Updates

```bash
cd /tmp
sudo -u vliegvuil bash -c '
  cd /srv/vliegvuil
  git pull --ff-only
  pnpm install --frozen-lockfile
  # VITE_ANALYTICS=1: production builds count page views (session 25c)
  VITE_ANALYTICS=1 pnpm --filter web build
'
# Only if the Caddyfile changed in this update:
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If `package.json` changed its `packageManager` pin, reinstall pnpm at the new
version first (§3).

Reload (not restart) keeps the rate-limit state and picks up the new build
without dropping connections.

The build replaces `web/dist` in place, so for the ~15 seconds it takes the
site can serve a half-written app. That is acceptable for now. If it ever
matters, build into a release directory and switch a symlink that the
Caddyfile's `root` points at.

This is also the whole deploy after you merge a data refresh PR. Keep the
server's working tree clean (`git status` should show nothing): if it is
not, `git pull --ff-only` fails, which is the signal that something edited
tracked files on the server.

Rolling back a bad release: revert the pull request on GitHub, then repeat
the commands above.

