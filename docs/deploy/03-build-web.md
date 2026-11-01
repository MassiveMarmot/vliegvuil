## 3. Build the web app

Run builds as the `vliegvuil` user so files are not owned by root.

The repository pins its package manager (`packageManager` in `package.json`,
currently `pnpm@10.34.1`). Install exactly that version once, and keep it in
sync when the pin changes:

```bash
cd /tmp
grep '"packageManager"' /srv/vliegvuil/package.json   # shows the pinned pnpm version
sudo npm install -g pnpm@10.34.1                      # use the version printed above
pnpm --version
```

The repository's `preinstall` script runs `npx only-allow pnpm`, which is why
`npm` must be installed as well.

```bash
sudo -u vliegvuil bash -c '
  cd /srv/vliegvuil
  pnpm install --frozen-lockfile
  # VITE_ANALYTICS=1: production builds count page views (session 25c);
  # dev, tests and CI builds run without it and never count.
  VITE_ANALYTICS=1 pnpm --filter web build
'
```

The built app ends up in `/srv/vliegvuil/web/dist` — the path the Caddyfile
expects.

### Build-time site configuration (session 25b)

The build bakes the site origin and name into the prerendered pages,
sitemap and robots.txt. The variables (see `web/src/config/site.ts` and
`web/scripts/gen-static-pages.ts`):

- `VITE_SITE_ORIGIN` — the canonical origin, e.g. `https://vliegvuil.nl`
  (default). Used in every canonical URL, hreflang alternate, `og:url` and
  the sitemap.
- `VITE_SITE_NAME` — the visible site name (default `VliegVuil.nl`).

**Building for another origin** (for example a sibling site on another
domain — the code contains no hard-coded domain):

```bash
VITE_SITE_ORIGIN=https://example.eu VITE_SITE_NAME="Example.eu" VITE_ANALYTICS=1 \
  pnpm --filter web build
```

The same command produces `dist/{nl,en}/…` prerendered pages, robots.txt and
sitemap.xml pointing at `https://example.eu`. No other change is needed;
the Caddyfile's root redirect and `x-default` hreflang target follow the
redirect rules above, and `dist/robots.txt`'s `Sitemap:` line uses the new
origin. Nothing about the deployment itself is origin-specific beyond these
variables and the site block in the Caddyfile.

