## 4. Install the Caddyfile

```bash
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile

# The caddy user must be able to read the built app:
sudo -u caddy test -r /srv/vliegvuil/web/dist/index.html && echo "readable"

sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

**Always run `caddy validate` with the custom binary from step 1** — the
standard distribution rejects the `rate_limit` and `cache` directives. On
the first start Caddy obtains the TLS certificate automatically; this needs
the DNS record from the prerequisites and ports 80/443 open.

### Staging (optional, not set up yet)

Staging does not exist today. This section is a plan for when a change needs
testing against real Caddy behaviour that a local preview cannot provide
(the root redirect, `try_files` deep links, response headers, a generated
sitemap/robots.txt; the first candidate is session 25b). Plain UI work is
tested locally (next section), not on staging.

Convention: a staging subdomain (`staging.vliegvuil.nl`) on the same VPS.

- **DNS**: A and AAAA records for the staging hostname pointing at the same
  VPS. Caddy then obtains and renews the certificate automatically: a site
  address with a hostname activates automatic HTTPS, which provisions
  certificates and redirects HTTP to HTTPS
  (<https://caddyserver.com/docs/automatic-https>, "Effects"). No manual
  certificate step is needed.
- **Separate web root**: build the branch under test to its own root (for
  example `/srv/vliegvuil-staging/web/dist`), never the production root
  (`/srv/vliegvuil/web/dist`), so a staging deploy cannot overwrite
  production files.
- **Access control**: the staging block must be behind HTTP Basic
  Authentication. Caddy's directive is `basic_auth` (renamed from
  `basicauth` in v2.8.0;
  <https://caddyserver.com/docs/caddyfile/directives/basic_auth>). Hashes,
  never plaintext: generate with `caddy hash-password` and put the hash in
  the config.
- **Not indexed**: serve `X-Robots-Tag: noindex` on every response (a plain
  `header X-Robots-Tag "noindex"` per
  <https://caddyserver.com/docs/caddyfile/directives/header>) plus a
  disallow-all `robots.txt` from the staging root.
- **Why access control is required**: every certificate Caddy obtains from a
  public CA is submitted to Certificate Transparency logs, and those logs
  are crawled by bots that discover hostnames. Let's Encrypt documents
  this: "After successful validation, your certificate will be submitted to
  numerous Certificate Transparency (CT) logs ... automated CT crawling bots
  will be able to discover your domain, attempt to access it, and generate
  further traffic in your webserver logs."
  (<https://letsencrypt.org/docs/faq/>). A staging hostname is therefore
  discoverable by anyone, not secret.
- **HSTS**: the production site sends HSTS with `max-age=86400` (one day),
  without `includeSubDomains` and without `preload` (see "HSTS: enabled at
  the first ramp-up step" in the header verification section below) — so
  the apex header does not cover a staging subdomain, and staging must
  serve valid HTTPS on its own. Do not add a HSTS header to the staging
  block; staging is not a place to make that decision (see the HSTS and
  Subdomains plan in this file).
- **Shared resources — decide, do not assume**:
  - *Tiles*: share `/srv/vliegvuil/tiles` (symlink or read-only bind) or
    run a second 24 h tile download for a fully isolated copy. Both cost
    something (coupling vs disk and another Fair-Use download) — decide
    before setting staging up.
  - */api proxy*: staging would be a second consumer of adsb.fi's 1 req/s
    public limit, and the micro-cache keys include the request host
    (Souin cache keys include the host unless disabled; see the cache
    handler's `key.disable_host` option,
    <https://github.com/caddyserver/cache-handler>), so staging requests
    are not served from production's cache. Prefer running staging with
    mock data (`VITE_MOCK=1`) and not proxying `/api` at all.
  - *Rate-limit zones*: rate-limit zones are identified by name across the
    whole Caddy instance ("rate limit zones, which have a unique name of
    your choosing", <https://github.com/mholt/caddy-ratelimit>); a second
    site block must use its own zone names, or it will share limits with
    production.
  - *Analytics*: GoatCounter (session 25c) must not count staging traffic;
    decide the exclusion (separate site id or blocked script) when 25c is
    implemented.
- **Maintenance cost**: staging is one more build step, one more
  certificate and a wider patch surface. Keep it off when not in use:
  remove the DNS record and the site block, then reload Caddy (the normal
  validate/reload sequence from the sections above).

**UNTESTED TEMPLATE** — never run, not validated; a starting point only.
Kept `caddy fmt`-formatted (tabs, single blank lines). Omit the `/api`
proxy unless deliberately testing it (mock data instead); no rate-limit or
cache directives (own zones would be needed, see above); no HSTS. The
disallow-all `robots.txt` is a plain file in the staging root, not a Caddy
directive.

```
staging.vliegvuil.nl {
	basic_auth {
		# caddy hash-password
		staging <hashed-password>
	}
	root * /srv/vliegvuil-staging/web/dist
	try_files {path} /index.html
	file_server
	encode zstd gzip
	header X-Robots-Tag "noindex"
}
```

The template has not been run or validated in this repo's CI (CI validates
the production Caddyfile only). Run `caddy validate` with the custom binary
on the VPS before reloading, per the normal update sequence.

### Local preview

For plain UI work, run the Vite dev server locally — no VPS or Caddy
needed:

```bash
pnpm install
VITE_MOCK=1 pnpm --filter @vliegvuil/web dev
```

`VITE_MOCK=1` matters: there is no dev-server proxy for `/api`
(`web/vite.config.ts` configures none; `useAircraftData.ts` falls back to
the mock module only when `VITE_MOCK=1`), so without it the aircraft poll
fails and the stale/error banner shows. Other local limitations:

- `/tiles/` returns 404 locally, so the basemap is empty (the aircraft
  layer still renders — it is independent of basemap tiles).
- The service worker only exists after `pnpm build` and only acts under
  `vite preview` (a build preview), not the dev server.
- What a local preview cannot test: Caddy deep links and `try_files`, the
  real `/api` proxy (headers, micro-cache, rate limiting), the real tile
  serving and headers, and the production response headers. Those need
  staging or the production server.

### Root redirect ( / -> /{lang}/ )

`/` has no language segment, so the app itself would render the not-found
view. The Caddyfile's `vliegvuil.nl` block therefore has a `handle` for
exactly `/` (a named matcher, placed before the other handle blocks) that:

- sets `Vary: Accept-Language` and `Cache-Control: no-store` (the redirect
  is language-dependent, so caches must key on the request language and
  must not store it), then
- redirects with **302** (deliberately not 301: browser- or
  language-preference changes must not be remembered) to `/en/` when the
  request's `Accept-Language` header starts with an English tag
  (`header_regexp ^\s*en([-;,\s]|$)`), otherwise to `/nl/` (the default).

The first-listed tag decides: `en-US,en;q=0.9` goes to `/en/`, and `nl`,
`de` or no header go to `/nl/`. **q-values are not parsed** — a header like
`de;q=1.0, en;q=0.9` starts with `de` and therefore goes to `/nl/`, even
though the q-values say otherwise. That is the accepted trade-off: it keeps
the rule a single regex with no q-value parsing in Caddy config.

Verify after deploy:

```bash
# English-first header: 302 to /en/
curl -sSI -H 'Accept-Language: en-US,en;q=0.9' https://vliegvuil.nl/ | grep -iE 'HTTP/|location|vary|cache-control'
# Dutch, German and no header: 302 to /nl/
curl -sSI -H 'Accept-Language: nl-NL,nl;q=0.9' https://vliegvuil.nl/ | grep -i location
curl -sSI -H 'Accept-Language: de-DE,de;q=0.9,en;q=0.5' https://vliegvuil.nl/ | grep -i location
curl -sSI https://vliegvuil.nl/ | grep -i location
```

Expected: every response is `302` with `Location: /en/` or `Location: /nl/`,
carries `Vary: Accept-Language` and `Cache-Control: no-store`, and `/nl/`
or `/en/` (the SPA routes) still serve the app as before. The status quo
before this change — `/` showing the in-app not-found page — is the bug
this fixes.

