# VliegVuil.nl - Deployment Guide

## Overview

VliegVuil.nl is a static web application with a reverse proxy configuration for API requests. The application consists of:

- **`/web`**: Static SPA built with Vite + React + TypeScript + MapLibre GL
- **`/core`**: Pure TypeScript library for data processing
- **`/data-build`**: Scripts for producing data snapshots and tiles

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      vliegvuil.nl                              │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐ │
│  │   Static SPA         │  │        Caddy Reverse Proxy         │ │
│  │  (Vite build output) │  │   - api.vliegvuil.nl → adsb.lol   │ │
│  │  /web/dist           │  │   - ~5s micro-cache               │ │
│  │                     │  │   - No client IP forwarding        │ │
│  └─────────────────────┘  │   - Rate limiting                 │ │
│                         └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  adsb.lol API    │
                    │  (external)      │
                    └──────────────────┘
```

## Prerequisites

- A Linux server (recommended: Ubuntu 22.04 LTS or newer)
- Domain name (vliegvuil.nl) with DNS configured
- SSH access to the server
- Docker (optional, for containerized deployment)

## Quick Start with Caddy

### 1. Install Caddy

```bash
# On Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 2. Verify Caddy Installation

```bash
caddy version
caddy validate --config /path/to/Caddyfile
```

### 3. Configure Caddy

Copy the `Caddyfile` to `/etc/caddy/Caddyfile`:

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile
```

### 4. Set Up Directory Structure

```bash
sudo mkdir -p /var/www/vliegvuil
sudo chown -R $USER:$USER /var/www/vliegvuil
```

### 5. Build and Deploy the Web App

```bash
# Build the web app
cd /workspace/github__MassiveMarmot__vliegvuil
pnpm --filter web build

# Copy to web root
cp -r web/dist/* /var/www/vliegvuil/
```

### 6. Update Caddyfile Paths

Edit `/etc/caddy/Caddyfile` and update the root path:

```caddyfile
vliegvuil.nl {
    root * /var/www/vliegvuil
    # ... rest of config
}
```

### 7. Start Caddy

```bash
# Test configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Start Caddy (runs as a service)
sudo systemctl restart caddy

# Check status
sudo systemctl status caddy
```

### 8. Enable HTTPS

Caddy automatically provisions and renews Let's Encrypt certificates. Ensure:
- Port 80 and 443 are open in your firewall
- DNS A records point to your server IP

```bash
# Check firewall
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Docker Deployment

### 1. Build Docker Image

```bash
# Build the web app
docker build -t vliegvuil/web -f web/Dockerfile .
```

### 2. Run with Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  web:
    image: vliegvuil/web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

```bash
docker-compose up -d
```

## Configuration Details

### Caddy Features

| Feature | Configuration | Purpose |
|---------|--------------|---------|
| `access_log off` | Global | No access logging for privacy |
| `try_files {path} /index.html` | vliegvuil.nl | SPA routing support |
| `encode gzip` | vliegvuil.nl | Compression for faster loads |
| CSP Headers | vliegvuil.nl | Security: restrict resource loading |
| Rate Limiting | Both hosts | Prevent abuse (100 req/min site, 60 req/min API) |
| Cache | api.vliegvuil.nl | ~5s micro-cache reduces upstream load |
| Header Stripping | api.vliegvuil.nl | No client IP/headers forwarded to adsb.lol |

### Security Headers

The CSP policy allows:
- `default-src 'self'`: All resources from own origin
- `script-src 'self'`: Scripts from own origin only
- `style-src 'self' 'unsafe-inline'`: Styles from own origin + inline (for MapLibre)
- `img-src 'self' data: https://geodata.nationaalgeoregister.nl`: Images from self, data URIs, and PDOK tiles
- `connect-src 'self' https://api.adsb.lol`: XHR/fetch to self and adsb.lol
- `font-src 'self'`: Fonts from own origin
- `frame-src 'none'`: No iframes
- `object-src 'none'`: No plugins (Flash, etc.)
- `base-uri 'self'`: Base tag only from self
- `form-action 'self'`: Form submissions only to self

### Privacy Protections

1. **No Access Logs**: `access_log off` prevents logging of every request
2. **No Client IP Forwarding**: Headers like `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP` are stripped before forwarding to upstream services
3. **No Third-Party Requests**: Only own-origin and PDOK tiles are allowed by CSP
4. **Rate Limiting**: Prevents any single IP from overwhelming the service

## Monitoring

### Check Caddy Logs

```bash
# Error logs (access logs are disabled)
journalctl -u caddy -f

# Or for Docker
docker logs <container_name>
```

### Health Checks

```bash
# Check if Caddy is running
curl -I https://vliegvuil.nl

# Check API proxy
curl -I https://api.vliegvuil.nl/v2/point?lat=52.3&lon=4.7&radius=1
```

## Updates

### Update Caddy

```bash
sudo apt update && sudo apt upgrade caddy
sudo systemctl restart caddy
```

### Update Application

```bash
# Pull latest changes
cd /workspace/github__MassiveMarmot__vliegvuil
git pull origin main

# Rebuild
pnpm --filter web build

# Deploy
cp -r web/dist/* /var/www/vliegvuil/

# Restart Caddy (if needed)
sudo systemctl restart caddy
```

## Troubleshooting

### Caddy Validation

```bash
caddy validate --config /etc/caddy/Caddyfile
```

### Test Configuration Locally

```bash
# Run Caddy locally for testing
caddy run --config Caddyfile --address 0.0.0.0:8080

# Then access http://localhost:8080
```

### Common Issues

1. **Port Conflicts**: Ensure no other service is using port 80 or 443
2. **DNS Issues**: Verify DNS records are correct and propagated
3. **Firewall**: Check that ports 80 and 443 are open
4. **Certificate Issues**: Caddy handles this automatically, but check `journalctl -u caddy` for errors

## Performance Considerations

- The ~5s micro-cache on API responses reduces load on adsb.lol
- Gzip compression is enabled for static assets
- Rate limiting prevents abuse while allowing normal usage
- For high traffic, consider adding a CDN in front of Caddy

## Backup

### Backup Caddy Data

```bash
# Certificates and configuration
sudo tar czvf caddy_backup.tar.gz /etc/caddy /var/www/vliegvuil
```

## License

This deployment configuration is provided as-is. The application itself is MIT licensed.
