# VliegVuil.nl Web App Dockerfile
# Multi-stage build for production

# Stage 1: Build the web application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY web/package.json ./web/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY web/ ./web/
COPY core/ ./core/
COPY locales/ ./locales/
COPY sources.json ./

# Build the web app
RUN pnpm --filter web build

# Stage 2: Serve with Caddy
FROM caddy:2-alpine

WORKDIR /app

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built web app
COPY --from=builder /app/web/dist /usr/share/caddy

# Copy static assets if any
COPY --from=builder /app/web/public /usr/share/caddy/public

# Expose ports
EXPOSE 80 443

# Run Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
