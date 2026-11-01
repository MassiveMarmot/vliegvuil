## 5. Privacy properties (what to expect)

- **No access logs.** Caddy does not write access logs unless one is
  explicitly configured; the Caddyfile does not configure one. There is no
  `access_log off` directive because that is not valid Caddy syntax — see
  <https://caddyserver.com/docs/caddyfile/directives/log>.
- **No visitor IP in any log (scrubbed error log).** Caddy's HTTP error
  logger (`http.log.error`) embeds the full request object (remote_ip,
  client_ip, headers, URI — which also contains the map viewport) in every
  failed or cancelled request; with the SPA polling /api every 5 s,
  cancelled polls made IPs accumulate in the journal (found during the
  25c deploy verification). The Caddyfile routes that logger through a
  filter encoder that DELETES the request object and redacts IPs from
  the error field, and excludes it from the default log; Go stdlib
  server messages (`http.stdlib`, including TLS handshake failures) log
  at Debug level and are not emitted at the default INFO level.
  Verified against the Caddy 2.11.7 source and by live tests (see the
  scrub PR): a forced 500 logs status/duration/trace but no request
  object; a garbage-HTTP + failed-TLS-handshake test produced zero IPs
  in the log.
- **No client IP upstream.** All requests to `/api/*` are forwarded with
  `X-Forwarded-For` (and friends) deleted and a fixed
  `User-Agent: VliegVuil.nl/1.0 (+https://vliegvuil.nl)`. adsb.fi never
  learns the visitor IP.
- **Same-origin API.** The app makes no third-party API calls and no CORS
  headers exist. `connect-src` is `'self'` only. The analytics count
  (session 25c) is same-origin too: `/count` and `/count.js` are proxied
  by Caddy to the loopback GoatCounter (see 6b), so the browser still
  contacts only vliegvuil.nl.
- **One route sees the visitor IP, on purpose:** the Caddy-to-GoatCounter
  localhost route passes `X-Forwarded-For` so GoatCounter can derive the
  country and the session key **in memory**. With `KillSignal=SIGKILL`
  (see 6b) the session key is never written to disk; the IP is never
  stored in the database or logged by either Caddy or GoatCounter. Every
  other route - and the entire ADS-B proxy - still strips the IP.
- **Third-party requests from the browser:** none. The basemap tiles are
  self-hosted at `/tiles/{z}/{x}/{y}.png`; `service.pdok.nl` appears in no
  CSP directive.
  `worker-src 'self' blob:` permits the PWA service worker (`/sw.js`,
  same-origin script) plus MapLibre's blob workers.
- **System logs are a separate thing.** `sshd` logs administrator logins and
  the firewall logging is turned off in the baseline (`ufw logging off`).

Observation from the live server (2026-10-12): Caddy serves the
self-hosted map-glyph `.pbf` files without a `Content-Type` header
(the `verify-caddy-headers.sh` check only asserts it is not HTML;
MapLibre accepts the files regardless). TODO for a later Caddy
update: map `.pbf` to an explicit content type, e.g.
`header /fonts/* Content-Type application/octet-stream`, or register
`application/vnd.mapbox-vector-tile` if the MapLibre docs recommend
it — verify there first.

Verify the header stripping at any time:

```bash
cd /srv/vliegvuil && scripts/verify-caddy-headers.sh "$(command -v caddy)"
```

This spins up a local echo upstream, proxies through Caddy with the same
`header_up` directives, and fails if any client-identifying header or the
test client IP reaches the upstream.

Verify that visitor IPs do not end up in the journal. Open the site from a
device, then check:

```bash
sudo journalctl -u caddy --since "1 hour ago" \
  | grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}' || echo "no IPv4 addresses found"
```

Expected result: no IPv4 addresses found. The error log is scrubbed
(the global log block in the Caddyfile deletes the request object from
http.log.error entries and redacts IPv4 in the error field), so any hit
means the scrub was lost - fix the Caddyfile, not the journal. As defence
in depth, cap journal retention (a system-level setting, unrelated to the
GoatCounter data-retention setting in 6b):

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/10-retention.conf <<'CONF'
[Journal]
MaxRetentionSec=7day
CONF
sudo systemctl restart systemd-journald
```

If the check ever fails because addresses appeared, see the GoatCounter
verification checklist in 6b for the post-deploy journal rotate/vacuum
step, and update `docs/privacy.md` to describe what is actually logged.

### style-src re-verification (maplibre-gl upgrades)

The CSP's `style-src 'self'` (no `unsafe-inline`) depends on the shipped
bundle never creating inline styles or style attributes. After ANY
maplibre-gl upgrade, rebuild and re-run the grep before deploying the
new Caddyfile-less bundle:

```bash
pnpm build
cd web/dist/assets
grep -riE "createElement\([^)]{0,20}style|setAttribute\([^)]{0,15}style" . ; grep -ri "cssText" .
```

Zero matches = the CSP can stay as it is. Any match in a maplibre chunk
means `style-src 'self'` would break the map at runtime: do NOT relax the
CSP on your own - open an issue with the exact grep output and decide
together (options: `style-src-elem` with a hash, or maplibre's CSP
documentation if it names the required directive). The last check ran on
2026-10-30 against maplibre-gl 6.14.0: zero matches in every chunk. This
grep proves only that no inline style is *created*; it was not tested in
a real browser - after deploying, load the site with devtools open, open
the compass, an airport popup and the legend, and confirm zero CSP
violations in the console.

