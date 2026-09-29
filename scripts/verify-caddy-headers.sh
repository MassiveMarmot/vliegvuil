#!/usr/bin/env sh
# Verifies that the API proxy strips client-identifying headers before
# forwarding upstream. Uses the same header_up directives as the real
# Caddyfile, but proxies to a local echo server.
#
# Requirements: caddy binary with the same modules as the deployment build
# (see docs/deploy.md), python3.
#
# Usage: scripts/verify-caddy-headers.sh [path-to-caddy-binary]
set -eu

CADDY="${1:-caddy}"
command -v "$CADDY" >/dev/null 2>&1 || { echo "caddy binary not found: $CADDY" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

WORK="$(mktemp -d)"
ECHO_PID=''
CADDY_PID=''
cleanup() {
	[ -n "$CADDY_PID" ] && kill "$CADDY_PID" 2>/dev/null
	[ -n "$ECHO_PID" ] && kill "$ECHO_PID" 2>/dev/null
	rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

# 1. Pick two free ports
PORTS="$(python3 -c "
import socket
socks = []
ports = []
for _ in range(2):
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    socks.append(s)
    ports.append(s.getsockname()[1])
print(*ports)
")"
ECHO_PORT="$(echo "$PORTS" | awk '{print $1}')"
PROXY_PORT="$(echo "$PORTS" | awk '{print $2}')"

# 2. Echo upstream: records the headers it received as JSON
cat > "$WORK/echo.py" <<'EOF'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = sys.argv[1]
PORT = int(sys.argv[2])

class Echo(BaseHTTPRequestHandler):
    def do_GET(self):
        with open(LOG, 'w') as f:
            json.dump(dict(self.headers), f)
        body = b'{"ac":[],"now":0}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', PORT), Echo).serve_forever()
EOF
python3 "$WORK/echo.py" "$WORK/headers.json" "$ECHO_PORT" &
ECHO_PID=$!

# 3. Caddy site: same header_up/header_down directives as the real Caddyfile,
#    but proxying to the local echo server.
sed -e "s/__ECHO_PORT__/$ECHO_PORT/" > "$WORK/Caddyfile.test" <<'EOF'
:__PROXY_PORT__ {
	handle /api/* {
		uri strip_prefix /api
		reverse_proxy http://127.0.0.1:__ECHO_PORT__ {
			header_up -X-Forwarded-For
			header_up -X-Real-IP
			header_up -X-Forwarded-Proto
			header_up -X-Forwarded-Host
			header_up User-Agent "VliegVuil.nl/1.0 (+https://vliegvuil.nl)"
			header_up Accept "application/json"
			header_down -Server
			header_down -Via
			header_down -X-Powered-By
		}
	}
}
EOF
sed -i -e "s/__PROXY_PORT__/$PROXY_PORT/" "$WORK/Caddyfile.test"

"$CADDY" run --config "$WORK/Caddyfile.test" --adapter caddyfile > "$WORK/caddy.log" 2>&1 &
CADDY_PID=$!

# 4. Wait for both servers
python3 - "$ECHO_PORT" "$PROXY_PORT" <<'EOF'
import socket, sys, time

echo, proxy = (int(x) for x in sys.argv[1:3])
deadline = time.time() + 15
while time.time() < deadline:
    ok = True
    for port in (echo, proxy):
        try:
            socket.create_connection(('127.0.0.1', port), 0.2).close()
        except OSError:
            ok = False
    if ok:
        sys.exit(0)
    time.sleep(0.2)
sys.exit('servers did not come up')
EOF

# 5. Request through the proxy with client-identifying headers set
python3 - "$WORK/headers.json" "$PROXY_PORT" <<'EOF'
import json, sys, urllib.request

proxy_port = sys.argv[2]
req = urllib.request.Request(
    f'http://127.0.0.1:{proxy_port}/api/point/52.1/5.3/50',
    headers={
        'User-Agent': 'Mozilla/5.0 (test client)',
        'X-Forwarded-For': '203.0.113.7',
        'X-Real-IP': '203.0.113.7',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'vliegvuil.nl',
        'Accept': '*/*',
    },
)
with urllib.request.urlopen(req, timeout=10) as r:
    assert r.status == 200, r.status

with open(sys.argv[1]) as f:
    headers = json.load(f)

leaked = [k for k in headers if k.lower() in (
    'x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host',
)]
# No header value may contain the client IP we sent
ip_leaked = [k for k, v in headers.items() if '203.0.113.7' in v]

if leaked:
    print('FAIL: client-identifying headers reached upstream:', leaked)
    sys.exit(1)
if ip_leaked:
    print('FAIL: client IP leaked in headers:', ip_leaked)
    sys.exit(1)

assert headers.get('User-Agent') == 'VliegVuil.nl/1.0 (+https://vliegvuil.nl)', headers.get('User-Agent')
print('OK: no client IP or forwarding headers reached the upstream')
print('OK: User-Agent was replaced with', headers['User-Agent'])
print('Upstream received these headers:')
for k, v in sorted(headers.items()):
    print(f'  {k}: {v}')
EOF
