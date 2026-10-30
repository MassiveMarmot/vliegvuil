#!/usr/bin/env sh
# Static guard for the Caddyfile's error-log IP scrub (PR #117, session 25c
# finding). Fails when the Caddyfile loses any of the three pieces that
# keep visitor IPs out of the systemd journal:
#   1. a global log named 'scrubbed' that includes http.log.error;
#   2. 'request delete' inside that log's filter encoder (without it the
#      request object - remote_ip, client_ip, headers, URI - is embedded
#      in every failed/cancelled request);
#   3. 'exclude http.log.error' on the default log (entries go to every
#      matching log, so without the exclude they would ALSO be written
#      unscrubbed to the default log).
#
# Purely textual (needs no caddy binary, safe in CI). Also self-tests with
# negative fixtures: a copy of the Caddyfile with each guarded line
# removed must FAIL the same checks.
#
# Usage: scripts/verify-caddy-scrub.sh [path-to-Caddyfile]
set -eu

CADDYFILE="${1:-Caddyfile}"
[ -f "$CADDYFILE" ] || { echo "FAIL: Caddyfile not found: $CADDYFILE" >&2; exit 1; }

check() {
	# $1 = file, $2 = description of the missing piece
	if ! grep -Eq 'log[[:space:]]+scrubbed[[:space:]]*\{' "$1"; then
		echo "FAIL: no global 'log scrubbed' block ($2)" >&2
		return 1
	fi
	if ! grep -Eq 'include[[:space:]]+http\.log\.error' "$1"; then
		echo "FAIL: scrubbed log does not include http.log.error ($2)" >&2
		return 1
	fi
	if ! grep -Eq 'request[[:space:]]+delete' "$1"; then
		echo "FAIL: no 'request delete' in the scrubbed log's filter ($2)" >&2
		return 1
	fi
	if ! grep -Eq 'exclude[[:space:]]+http\.log\.error' "$1"; then
		echo "FAIL: default log does not exclude http.log.error ($2)" >&2
		return 1
	fi
	return 0
}

if check "$CADDYFILE" "real Caddyfile"; then
	echo "OK: Caddyfile has the scrubbed http.log.error config (include, request delete, default-log exclude)"
else
	exit 1
fi

# Negative tests: strip one guarded element at a time from a temp copy;
# each stripped copy must FAIL the checks. Proves the checks can actually
# fire (a check that never fails guards nothing).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

neg() {
	# $1 = sed expression, $2 = label
	cp "$CADDYFILE" "$WORK/Caddyfile.neg"
	sed -i "$1" "$WORK/Caddyfile.neg"
	if check "$WORK/Caddyfile.neg" "negative fixture: $2 removed" 2>"$WORK/err"; then
		echo "FAIL: negative test passed - removing '$2' was not detected" >&2
		exit 1
	fi
	echo "OK: negative test - removing '$2' is detected:" \
		"$(cat "$WORK/err")"
}

neg '/log scrubbed[[:space:]]*{/s/scrubbed/scrubbed_x/' 'log scrubbed name'
neg '/include http\.log\.error/d' 'include http.log.error'
neg '/request delete/d' 'request delete'
neg '/exclude http\.log\.error/d' 'exclude http.log.error'

echo "OK: all scrub checks and negative tests passed"
