## Troubleshooting

```bash
# Validation must pass before every reload
caddy validate --config /etc/caddy/Caddyfile

# Error logs (no access logs exist). HTTP error entries are SCRUBBED:
# no request object (no IP/headers/URI), only status/duration/trace -
# see the global log config at the top of the Caddyfile.
journalctl -u caddy -f
# GoatCounter errors (stderr only; never enable -debug: the session debug
# log prints the session key)
journalctl -u goatcounter -f

# Live checks
curl -sSI https://vliegvuil.nl | head -20
curl -sS https://vliegvuil.nl/api/point/52.37/4.9/5 | head -c 200
```

If `caddy validate` reports an unknown directive (`rate_limit`, `cache`),
you are running the standard distribution instead of the custom binary from
step 1: check `update-alternatives --display caddy`.

If the certificate is not issued, check that the DNS record points at this
server and that ports 80 and 443 are open in both the server firewall and
any provider firewall.

If `pnpm install` fails with "Cannot find matching keyid", something is using
Corepack: remove the Corepack shims (`sudo corepack disable`) and use the
npm-installed pnpm from §3.

If `sudo` rejects an option that works elsewhere, you are on sudo-rs; try the
original with `sudo.ws` to compare.
