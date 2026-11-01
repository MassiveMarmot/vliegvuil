## 2. Install the app

The repository is public, so the server can clone it over HTTPS **without
any credential**. If the repository is ever made private again, use a
read-only deploy key instead (GitHub → Settings → Deploy keys, leave "Allow
write access" unchecked, and verify GitHub's SSH host key fingerprint
against the one published in GitHub's documentation before accepting it).

```bash
# The app lives in /srv/vliegvuil (owned by the vliegvuil user); the user's
# home is /home/vliegvuil, so the clone target is an empty directory.
cd /tmp
sudo useradd -m -s /bin/bash vliegvuil || true
sudo mkdir -p /srv/vliegvuil
sudo chown vliegvuil:vliegvuil /srv/vliegvuil
sudo chmod 755 /srv/vliegvuil          # the caddy user must be able to read it

sudo -u vliegvuil git clone https://github.com/<owner>/vliegvuil.git /srv/vliegvuil
```

