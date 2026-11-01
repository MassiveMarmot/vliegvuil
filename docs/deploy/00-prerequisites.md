## Prerequisites

- VPS running **Ubuntu 26.04 LTS** with ports 80 and 443 (TCP) reachable
- Domain `vliegvuil.nl` with an A record (and an AAAA record if the VPS has
  IPv6) pointing at the server
- `git`, `curl`, `gnupg`, `python3` (used by `scripts/verify-caddy-headers.sh`),
  a Go toolchain (for `xcaddy`), and Node.js 22 with npm and pnpm (for
  building the web app)
- SSH access with a key

Ubuntu 26.04 notes (from the Ubuntu 26.04 release notes and package pages):

- `sudo` is now **sudo-rs** and most core utilities are the Rust **uutils**
  implementations. In 26.04, `cp`, `mv` and `rm` are **still GNU** (they
  switch in 26.10), and the commands in this guide use only basic features
  anyway. The traditional sudo is available as `sudo.ws` (and the GNU
  coreutils as the `coreutils-from-gnu` package) if anything misbehaves.
- **Do not use `sudo -H`.** sudo-rs does not list a `-H` option in its manual
  and always sets `HOME` from the target user, so `sudo -u vliegvuil bash -c
  '...'` already runs with the right home directory. This guide omits `-H`.
- Ubuntu's `nodejs` package is 22.22.1 (universe), which satisfies the
  repository's `engines` requirement (Node ≥ 22). Corepack is a separate,
  **old** package in Ubuntu 26.04 (`node-corepack` 0.24.0); Corepack older
  than 0.31.0 fails to download pnpm 10.1+ with "Cannot find matching keyid".
  This guide therefore installs pnpm with npm instead of using Corepack.
- Check what you actually have: `go version` and `node -v`. If Caddy or
  `xcaddy` needs a newer Go than Ubuntu provides, install Go from
  <https://go.dev/dl/>.
- `nodejs`, `npm` and `golang-go` come from the `universe` component. If
  `apt` cannot find them, run `sudo add-apt-repository universe`.
- Ubuntu home directories are not world-readable by default, and
  `sudo -u vliegvuil` inherits your current directory. **Run the commands in
  this guide from a neutral directory** (`cd /tmp`) to avoid "cannot access
  current directory" errors.

### Server baseline (once)

```bash
cd /tmp
sudo apt update && sudo apt upgrade
sudo apt install git curl gnupg ca-certificates golang-go nodejs npm
# unattended security updates (usually enabled on Ubuntu Server; verify)
sudo apt install unattended-upgrades
systemctl status unattended-upgrades --no-pager

# SSH by key only (keep your current session open while testing!)
sudo tee /etc/ssh/sshd_config.d/10-vliegvuil.conf <<'CONF'
PasswordAuthentication no
PermitRootLogin no
CONF
sudo sshd -t
# Ubuntu 26.04 starts sshd through ssh.socket; restarting ssh.service applies
# the new authentication settings and keeps your open session alive.
sudo systemctl restart ssh
# Show the settings sshd actually uses. Drop-in files are read in alphabetical
# order and the first value wins, so 10-vliegvuil.conf takes precedence over
# e.g. a provider's 50-cloud-init.conf.
sudo sshd -T | grep -iE '^(passwordauthentication|permitrootlogin)'

# Firewall (Ubuntu ships ufw inactive). Allow SSH first.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp     # HTTP/3
sudo ufw logging off       # ufw logs blocked packets with source IPs
sudo ufw enable
```

If your provider also offers a network firewall, allow the same ports there.

On OVHcloud this is the **Edge Network Firewall** (Control Panel → Network →
Public IP Addresses → ⋯ next to the VPS IPv4 → Configure Edge Network
Firewall). It is stateless and **IPv4-only**; ufw stays the authoritative
firewall, also for IPv6. Configure these rules (lowest priority number is
evaluated first; evaluation stops at the first match), then enable the
firewall while keeping your current SSH session open:

| Priority | Action | Protocol | Destination port | Notes |
|---|---|---|---|---|
| 0 | Accept | TCP | — | TCP state `Established` (stateless firewall; OVH advises this) |
| 1 | Accept | TCP | 22 | SSH; leave the source port empty |
| 2 | Accept | TCP | 80 | HTTP; needed for Let's Encrypt HTTP-01 and the redirect |
| 3 | Accept | TCP | 443 | HTTPS |
| 4 | Accept | UDP | 443 | HTTP/3; see the QUIC caveat below |
| 19 | Deny | IPv4 | — | Catch-all deny; without it accept-only rules are ineffective |

Caveats (from OVHcloud's Edge Network Firewall guide):

- The rules cannot *open* ports; the server firewall (ufw) decides that.
  Keep both in sync when the port set changes.
- QUIC (HTTP/3) is currently dropped at the OVHcloud network edge for IPv4
  regardless of these settings; IPv4 visitors fall back to HTTP/2. Over
  IPv6 (AAAA record) HTTP/3 still works, since the edge firewall is v4-only.
- The firewall auto-engages during a DDoS attack even when disabled, and
  the rules then apply — so keep the rules correct even if it is off.

Time sync is handled by `chrony`, the default on **new** Ubuntu 26.04
installs (a provider image may differ; check with `chronyc tracking`).

### DNS records

When the domain is registered, point it at the server. The site is reachable
over IPv4 and IPv6, so create both records at the registrar:

- **A record**: `vliegvuil.nl` → the VPS IPv4 address
- **AAAA record**: `vliegvuil.nl` → the VPS IPv6 address (check with
  `ip -6 addr show` on the server; use the public `2xxx:…` address)

Without the AAAA record the site works, but IPv6 visitors cannot connect
(and HTTP/3, which OVHcloud's edge drops for IPv4, stays unreachable). Add
the AAAA record after registering the domain and verify from a client with
`dig A vliegvuil.nl +short` and `dig AAAA vliegvuil.nl +short`. If the VPS
has no IPv6 address, skip the AAAA record.

Post-setup checklist:

- [ ] key login as a non-root user works, from a **new** terminal
- [ ] `ssh -o PreferredAuthentications=password <user>@vliegvuil.nl` is refused
- [ ] `sudo sshd -T` shows `passwordauthentication no` and `permitrootlogin no`
- [ ] `sudo ufw status` shows only OpenSSH, 80/tcp, 443/tcp, 443/udp
- [ ] if a provider edge firewall is enabled, its rule set matches the ufw
      port set and a `Deny` catch-all exists
- [ ] once the domain is registered: A and AAAA records resolve to the VPS
      (`dig A vliegvuil.nl +short`, `dig AAAA vliegvuil.nl +short`)
- [ ] `systemctl is-active unattended-upgrades` prints active
- [ ] `chronyc tracking` reports a synchronised clock
- [ ] the OVHcloud web console (KVM) was tested once — it is the break-glass
      path once password SSH is off

