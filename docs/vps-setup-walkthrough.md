# VliegVuil.nl VPS Setup Walkthrough

A novice-friendly walkthrough for `docs/deploy.md` in [MassiveMarmot/vliegvul](https://github.com/MassiveMarmot/vliegvul),
adapted for: client = Ubuntu 24.04 LTS, server = Ubuntu 26.04 LTS VPS (OVHcloud),
SSH key generated with `ssh-keygen` and stored/served via KeePassXC (Flatpak).

> Replace `<owner>` with the GitHub account that owns the repository, and
> `<user>`/`<IP>` with your VPS username and IP address.

---

## Phase 0 — On your own computer (Ubuntu 24.04)

### 1. Install KeePassXC and create your database

```bash
sudo apt update
sudo apt install keepassxc
```

(If you already run the Flatpak version from Flathub, that works too — see the note
in step 2 about the agent socket.)

Open KeePassXC and create a database with a strong password. **Back up the
`.kdbx` file** — it will contain your SSH private key.

### 2. Generate the SSH key (with ssh-keygen, NOT in KeePassXC)

KeePassXC cannot generate SSH keys — there is no "Generate" button. You create
the key with `ssh-keygen`, then import it into KeePassXC.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/vliegvul_vps -C "vliegvul VPS"
```

- Enter a strong passphrase when prompted (you'll store it in the KeePassXC entry).
- This creates `~/.ssh/vliegvul_vps` (private key) and `~/.ssh/vliegvul_vps.pub` (public key).

### 3. Enable KeePassXC's SSH agent integration

1. KeePassXC → **Tools → Settings → SSH Agent**.
2. Tick **Enable SSH Agent integration**. Leave the `SSH_AUTH_SOCK` and
   `SSH_SK_PROVIDER` override boxes empty.
   (Newer versions have no PuTTY checkbox — that support was removed. Your
   dialog is correct.)
3. The settings page should report that the agent connection succeeded.
   If it fails, see "Troubleshooting" below.
4. Restart KeePassXC.

**Flatpak note:** if the SSH Agent settings page shows
`SSH_AUTH_SOCK value /run/flatpak/ssh-auth`, you are running the Flatpak build.
That socket forwards your desktop's real agent into the sandbox, so your
terminal's `ssh` sees keys KeePassXC adds. No extra setup is needed — but if
the connection test fails, use Flatseal to grant the Flatpak the "SSH agent"
socket and/or the `SSH_AUTH_SOCK` environment variable.

### 4. Add the key to a KeePassXC entry

1. Create a new entry (e.g. title: `vliegvul VPS`).
2. Put the **key's passphrase** in the entry's **Password** field — KeePassXC
   uses it to decrypt the key.
3. Go to the **Advanced** tab → **Attachments** → **Add** → attach the
   **private** key file `~/.ssh/vliegvul_vps`.
4. Save/close the entry, then **reopen** it. There should now be an **SSH Agent**
   tab (key/terminal icon). In it:
   - **Private key**: select the attachment you added. KeePassXC shows the key
     type and fingerprint once it decrypts it.
   - **Public key**: add `~/.ssh/vliegvul_vps.pub` (or pick it in the dropdown).
   - Tick **Add key to agent when database is opened/unlocked**.
5. OK, then lock and unlock the database.

Verify the key is in your agent:

```bash
ssh-add -l
```

You should see the ED25519 fingerprint.

> **Caveat:** on GNOME, the desktop agent is gnome-keyring, which doesn't always
> remove keys when you lock the database. The key may stay in the agent until
> you log out. For a single-user personal machine this is usually acceptable.

### 5. First login — install the key on the VPS

Use the credentials from your provider (OVHcloud usually gives you `ubuntu`
or `root` plus a password):

```bash
ssh-copy-id -i ~/.ssh/vliegvul_vps.pub <user>@<IP>
```

This asks for the **password** one last time. Test key login in a **new** terminal:

```bash
ssh <user>@<IP>
```

If KeePassXC pops up asking to authorize the key for this host, click **Allow**
(or "Always allow").

⚠️ **Keep this session open for the whole of Phase 1!** If SSH hardening goes
wrong, this open session is your way back in.

---

## Phase 1 — Server baseline (once)

SSH in, then follow `docs/deploy.md` §"Server baseline":

```bash
sudo apt update && sudo apt upgrade
sudo apt install git curl golang-go nodejs npm
sudo apt install unattended-upgrades
systemctl status unattended-upgrades --no-pager
```

### If you logged in as root: create a sudo user first

The SSH hardening below disables root login, so you need a normal user:

```bash
sudo adduser deployer
sudo usermod -aG sudo deployer
```

Then install your key for that user too (from your own machine):

```bash
ssh-copy-id -i ~/.ssh/vliegvul_vps.pub deployer@<IP>
```

Log in as `deployer` in a new terminal and verify `sudo` works before continuing.

### SSH hardening (the guide's exact commands)

```bash
sudo tee /etc/ssh/sshd_config.d/10-vliegvuil.conf <<'CONF'
PasswordAuthentication no
PermitRootLogin no
CONF
sudo sshd -t && sudo systemctl reload ssh
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp     # HTTP/3
sudo ufw logging off       # ufw logs blocked packets with source IPs
sudo ufw enable
```

If OVHcloud also has a network firewall in its control panel, allow the same
ports there.

Time sync is handled by `chrony`, default on new 26.04 installs.

### Post-setup checklist (do ALL of these)

- [ ] Key login works **from a new terminal**
- [ ] `ssh -o PreferredAuthentications=password <user>@<IP>` is refused
- [ ] `sudo ufw status` shows only OpenSSH, 80/tcp, 443/tcp, 443/udp
- [ ] `systemctl is-active unattended-upgrades` prints `active`
- [ ] The OVHcloud web console (KVM) was tested once — it is your rescue path
      now that password SSH is off

---

## Phase 2 — Install Caddy with custom modules

The site needs a Caddy build with three extra modules (rate limiting +
micro-cache). Install official Caddy first, then build and swap in a custom
binary.

### 2a. Official Caddy repository

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
               /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Check toolchains first: `go version` and `node -v`. CI builds with Node 22; if
Ubuntu's Go is too old for `xcaddy`, install Go from <https://go.dev/dl/>.

### 2b. Build the custom binary (as an unprivileged user)

```bash
sudo useradd -m -s /bin/bash vliegvuil || true
sudo -u vliegvuil -H bash -c '
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
  cd ~ && ~/go/bin/xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/cache-handler \
    --with github.com/darkweak/storages/otter/caddy
'
```

This takes a few minutes (it downloads and compiles Caddy plus modules).

### 2c. Install it next to the packaged binary

```bash
sudo dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy
sudo mv /home/vliegvuil/caddy /usr/bin/caddy.custom
sudo chown root:root /usr/bin/caddy.custom && sudo chmod 755 /usr/bin/caddy.custom
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10
sudo update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50
sudo systemctl restart caddy
```

Verify:

```bash
caddy version
caddy list-modules | grep -E 'ratelimit|cache'
```

Both must show output — if the grep finds nothing, you are running the
standard binary instead of the custom one.

---

## Phase 3 — Install and build the app

The repo is public, so the server needs no GitHub credentials:

```bash
sudo mkdir -p /srv/vliegvuil
sudo chown vliegvuil:vliegvuil /srv/vliegvuil
sudo chmod 755 /srv/vliegvuil
sudo -u vliegvuil git clone https://github.com/<owner>/vliegvuil.git /srv/vliegvuil
```

Build the web app:

```bash
sudo corepack enable
sudo -u vliegvuil -H bash -c '
  cd /srv/vliegvuil
  pnpm install --frozen-lockfile
  pnpm --filter web build
'
```

The build output lands in `/srv/vliegvuil/web/dist` — the path the Caddyfile
expects.

---

## Phase 4 — Install the Caddyfile and go live

```bash
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile

sudo -u caddy test -r /srv/vliegvuil/web/dist/index.html && echo "readable"

sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

**Always validate with the custom binary** — the standard distribution rejects
the `rate_limit` and `cache` directives.

On the first reload, Caddy obtains the TLS certificate automatically. This
requires the DNS A record for `vliegvul.nl` to already point at the VPS and
ports 80/443 to be open.

Smoke test:

```bash
curl -sSI https://vliegvul.nl | head -20
curl -sS https://vliegvul.nl/api/point/52.37/4.9/5 | head -c 200
```

---

## Phase 5 — Privacy verification

The site is deliberately log-free and hides visitor IPs from adsb.lol. Verify:

```bash
cd /srv/vliegvuil && scripts/verify-caddy-headers.sh "$(command -v caddy)"
```

And, after browsing the site from a device:

```bash
sudo journalctl -u caddy --since "1 hour ago" \
  | grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}' || echo "no IPv4 addresses found"
```

---

## Day-to-day: updates (§7 of the guide)

Deploys are manual — git pull, rebuild, reload:

```bash
sudo -u vliegvuil -H bash -c '
  cd /srv/vliegvuil
  git pull --ff-only
  pnpm install --frozen-lockfile
  pnpm --filter web build
'
# Only if the Caddyfile changed in this update:
sudo cp /srv/vliegvuil/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Keep the server's working tree clean: if `git status` shows anything,
`git pull --ff-only` fails — that is the signal something edited tracked files
on the server.

## Maintenance gotchas

- **Caddy security updates do not reach the custom binary.** `apt upgrade`
  only updates the packaged one. Rebuild roughly monthly (step 2b) and swap it
  in as in 2c.
- **Never run the data-refresh tool on the server.** Data updates arrive as
  reviewed PRs; you merge, then run the update commands above.

## Troubleshooting

**KeePassXC: "Agent connection failed" / `ssh-add -l` shows nothing**

- In a terminal: `echo $SSH_AUTH_SOCK`. If it's empty, your desktop is running
  no agent; GNOME Keyring's agent usually provides it. Try logging out and back in.
- Flatpak KeePassXC: use **Flatseal** → KeePassXC → enable the "SSH agent"
  socket and add environment variable `SSH_AUTH_SOCK` with the value from the
  terminal above.
- If keys appear in `ssh-add -l` but `ssh` still asks for a password, check
  `ssh -v <user>@<IP>` output — the server decides which keys to accept.

**Locked out of the VPS:** the OVHcloud KVM console in the web panel is the
break-glass path — that's why the checklist asks you to test it once *before*
disabling password SSH.

**`caddy validate` reports unknown directives (`rate_limit`, `cache`):** you are
running the standard binary. Check `update-alternatives --display caddy`.

**Certificate not issued:** check the DNS record points at this server and
ports 80/443 are open in both the server firewall and any provider firewall.

```bash
# Error logs (no access logs exist)
journalctl -u caddy -f
```

---

## Novice tips

- Copy-paste multi-line command blocks as a whole (especially heredocs).
- Do Phase 1 in one sitting, verify the checklist, then close. Phases 2–4 have
  no lock-out risk and can be done separately.
- After everything works, make a note of the Caddy version
  (`caddy version`) you deployed, per the guide's advice.
