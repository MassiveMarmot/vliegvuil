## 6. Rate limiting and micro-cache

All zones key on `{http.request.remote.host/32,64}`: the full address for
IPv4, the top 64 bits for IPv6 (a /64 is the standard customer prefix, so
an IPv6 client rotating addresses inside its prefix hits the SAME bucket;
without this, every /128 was a fresh bucket). The placeholder is
EXPERIMENTAL in Caddy 2.11 (replacer.go, http.request.remote.host/N[,M]).

| Zone | Key | Limit | Purpose |
|------|-----|-------|---------|
| `static_per_ip` | remote host (/32,/64) | 120 events / 1 min | SPA shell and prerendered pages (catch-all only) |
| `api_per_ip` | remote host (/32,/64) | 240 events / 1 min | `/api/*` proxy (the app polls 12/min; ~15+ app instances per shared connection plus reload headroom) |
| `tiles_per_ip` | remote host (/32,/64) | 600 events / 1 min | `/tiles/*` self-hosted basemap (generous ceiling; cheap cached PNGs) |
| `fonts_per_ip` | remote host (/32,/64) | 600 events / 1 min | `/fonts/*` glyph ranges (generous ceiling; files from disk) |
| `assets_per_ip` | remote host (/32,/64) | 600 events / 1 min | `/assets/*` hashed build files (generous ceiling) |
| `count_per_ip` | remote host (/32,/64) | 120 events / 1 min | `/count` analytics endpoint (~4x a visitor navigating non-stop) |
| `countjs_per_ip` | remote host (/32,/64) | 120 events / 1 min | `/count.js` analytics script |

The zones are scoped per route: the static zone lives inside the catch-all
handle, so tile requests (dozens per map view) and API polls never eat the
SPA's budget, and vice versa. Before the tiles existed this was not visible:
the site-level zone counted every request, so a 404 flood from missing tiles
could starve the `/api` aircraft poll (429s surfacing as the rate-limit
banner).

The `/api/*` responses are micro-cached for 5 s (`cache { ttl 5s }`, otter
storage), which bounds upstream request pressure regardless of visitor
count. The upstream sends `Cache-Control: no-store`, which would make every
response a cache miss (`Cache-Status: ...; detail=NO-STORE-DIRECTIVE`); the
cache block therefore sets `mode bypass_response` so Souin ignores the
upstream response's cache directives and stores each response for the
5 s TTL (request-side RFC 7234 rules still apply). Note the app polls
roughly every few seconds per visitor; the 240/min zone leaves headroom
for shared connections (CGNAT, school or office NAT) while capping abuse.

Query-string hardening (review fix): the app never sends a query on
`/api/*`, and the cache key includes the query — so a varied query string
(`?x=1`, `?x=2`, ...) would bypass the micro-cache and reach adsb.fi
individually (their public limit is 1 req/s). Two layers fix this: the
`@api_shaped` matcher includes a bare `query` matcher, which admits ONLY
an empty query string (anything with a query falls through to the
catch-all and gets a 404, ordered BEFORE the shape-any-method 405 so the
response confirms nothing); and the upstream URL is rewritten from
`{path}` only, so even a slipped-through query could never reach adsb.fi
nor vary the cache key. Verified by `scripts/verify-caddy-headers.sh`
(query request → 404; upstream URL asserted query-free and
`/api/v2`-prefixed).

### Rate-limit smoke tests (manual; NOT run by CI)

These verify the rate-limit configuration on the live server after a
Caddyfile change. CI only validates the config parses (`caddy validate`);
the scripts in this repo do not exercise `rate_limit`. Run each from ONE
client machine so the per-key bucket is deterministic.

**(a) /api 429 beyond 240/min from one IPv4 address:**

```bash
# 241st request inside a minute must 429 with Retry-After.
# Note: a micro-cache HIT still counts against the rate limit (the zone
# is checked before the cache serves), so the loop fires the limit
# regardless of cache state.
ok=0; for i in $(seq 1 250); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    'https://vliegvuil.nl/api/lat/52.1234/lon/5.4321/dist/194')
  [ "$code" = 429 ] && { echo "429 at request $i"; break; }
  ok=$((ok+1))
done
echo "200s before the 429: $ok (expect ~240)"
# The 429 response must carry Retry-After:
curl -sI 'https://vliegvuil.nl/api/lat/52.1234/lon/5.4321/dist/194' | grep -i retry-after || true
```

**(b) IPv6 /64 bucket sharing (only if the tester has IPv6):**

```bash
# Two addresses inside the same /64 must share ONE bucket: hammering
# from the second address right after the first exhausted the budget
# must 429 immediately.
curl -6 -s -o /dev/null -w '%{http_code}\n' --interface 'your-first-v6' \
  'https://vliegvuil.nl/api/lat/52.1234/lon/5.4321/dist/194'  # repeat ~240x
curl -6 -s -o /dev/null -w '%{http_code}\n' --interface 'your-second-v6-same-/64' \
  'https://vliegvuil.nl/api/lat/52.1234/lon/5.4321/dist/194'   # expect 429
```

**(c) /count 429 beyond 120/min:**

```bash
ok=0; for i in $(seq 1 140); do
  code=$(curl -s -o /dev/null -w '%{http_code}' 'https://vliegvuil.nl/count?p=/test')
  [ "$code" = 429 ] && { echo "429 at request $i"; break; }
  ok=$((ok+1))
done
echo "200s before the 429: $ok (expect ~120)"
```

Expected `/api` response headers (what the proxy lets through):

- Kept: `Content-Type`, `Content-Length`, `Date` and Caddy's own headers
  (`Server: Caddy`, the security headers from the site block).
- Stripped (set by the upstream / Cloudflare, removed with `header_down`):
  `nel`, `Report-To`, `Reporting-Endpoints`, `Reporting-To`, every `Cf-*`
  header (`cf-ray`, `cf-cache-status`, ...), `Strict-Transport-Security`,
  `Set-Cookie`, and the upstream's `Server`/`Via`/`X-Powered-By` (Caddy's
  own `Server` header replaces it).
- Added by the cache: `Cache-Status` with a HIT on the second request
  within the 5 s TTL.

HSTS: enabled at the first ramp-up step, `max-age=86400` (one day), via a
`Strict-Transport-Security "max-age=86400"` line in the site-level `header`
block of the `vliegvuil.nl` Caddy site.

- **Current value and why**: one day is the deliberate first step of the
  ramp-up (docs/human-checkpoints.md, "Before 25b"). HSTS is sticky: a broken
  certificate or a bad reload locks browsers out until the max-age ends,
  so the first step is short enough to survive a day of mistakes.
- **includeSubDomains and preload are intentionally off.** Future
  subdomains (for example `stats.` for the GoatCounter dashboard, session
  25c) must serve valid HTTPS over their whole lifetime before
  includeSubDomains is ever considered; with it, a subdomain that drops
  HTTPS becomes unreachable for HSTS-pinned visitors. Preload is out of
  scope until the maintainer explicitly decides.
- **Ramp-up** (a later explicit decision each time, recorded here when it
  changes): 1 day → 1 week → 1 month → 1 year. Raise one step only after a
  week without TLS problems at the previous step. Current value (session 27
  review, verified in the Caddyfile: the site block sends
  `Strict-Transport-Security "max-age=86400"`): **max-age=86400 (one day)**.
  Next step when decided: max-age=604800 (one week).
- The site-level header applies to every response of the site block,
  `/api` included (Caddy `header` directives at site level run for all
  requests; the `/api` handler's `header_down -Strict-Transport-Security`
  strips the *upstream's* header inside `reverse_proxy` and does not undo
  the site-level one).

Verification (GET, not HEAD - the upstream answers 405 to HEAD):

```bash
curl -sS -D- -o /dev/null https://vliegvuil.nl/ | grep -i strict-transport
curl -sS -D- -o /dev/null https://vliegvuil.nl/nl/ | grep -i strict-transport
curl -sS -D- -o /dev/null https://vliegvuil.nl/api/lat/52.25/lon/5.0/dist/250 | grep -i strict-transport
```

Expect exactly one `Strict-Transport-Security: max-age=86400` line per
response. (A `/tiles/` URL should carry it too; the tile download is
still in progress, so missing tile files are expected - check a tile
that exists once the tile run completes.)

Verify after deploy (GET, not HEAD: the upstream answers 405 to HEAD):

```bash
URL=https://vliegvuil.nl/api/lat/52.2500/lon/5.0000/dist/250
# First request: expect no nel/report-to/reporting-/cf-*/strict-transport-security
# or set-cookie, and a cache MISS in Cache-Status.
curl -sS -D - -o /dev/null "$URL"
# Second request within 5 s: same headers, and a cache HIT.
curl -sS -D - -o /dev/null "$URL" | grep -iE 'cache-status|nel|report-to|reporting-|cf-|strict-transport-security|set-cookie'
# The grep must print only the Cache-Status HIT line: none of the stripped
# headers may appear. If nothing prints at all, Cache-Status was not sent
# either; investigate before accepting the deploy.
```

