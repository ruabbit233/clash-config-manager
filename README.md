# Clash Config Manager

A Cloudflare Workers-based Clash YAML configuration manager with a web admin panel.

**Public endpoint**: `https://example.com` — serves the latest YAML config with custom response headers.

**Admin panel**: `https://example.com/admin` — online YAML editor, version control, and response headers management.

## Architecture

```
Single Cloudflare Worker
├── GET /              → YAML config (public, custom headers from KV)
├── GET /download      → YAML config as file download
├── POST /api/auth/*   → Authentication (no token required)
├── /api/*             → Protected API (JWT Bearer token required)
├── GET /admin*        → Static assets (admin SPA)
└── catch-all          → env.ASSETS.fetch() passthrough
```

**Storage**: Cloudflare KV for config versions, current pointer, and custom headers.

**Auth**: JWT (HMAC-SHA256) with 7-day expiry. Login with password → receive JWT token.

## Setup

### Prerequisites

- Node.js 18+

### 1. Clone and install

```bash
git clone <repo-url> clash-config-manager
cd clash-config-manager
npm install
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create "CONFIG_KV"
```

Update the `id` in `wrangler.toml` `[[kv_namespaces]]` with the returned namespace ID.

### 3. Configure secrets

Copy `.dev.vars` and fill in your values:

```bash
cp .dev.vars .dev.vars.local
```

Set production secrets:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TOKEN_SECRET
```

`TOKEN_SECRET` should be at least 32 characters of random data.

### 4. Development

Start the Worker and admin UI dev servers in separate terminals:

```bash
# Terminal 1: Worker API
npm run dev

# Terminal 2: Admin UI (with HMR)
npm run dev:admin
```

- Worker API: http://localhost:8787
- Admin UI: http://localhost:5173 (proxies `/api/*` to Worker)

### 5. Deploy

```bash
npm run deploy
```

### 6. Custom domain

In `wrangler.toml` or Cloudflare dashboard, add a custom domain:

```toml
routes = [
  { pattern = "c.example.com/*", zone_name = "example.com" }
]
```

Or configure via Cloudflare Dashboard → Workers → your worker → Settings → Domains & Routes.

## API Reference

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | /api/auth/login | No | `{ password }` | `{ token, expiresAt }` |
| POST | /api/auth/verify | No | `{ token }` | `{ valid, expiresAt }` |
| GET | /api/config | Yes | — | `{ content, versionId, updatedAt }` |
| PUT | /api/config | Yes | `{ content, message? }` | `{ versionId, contentHash, createdAt }` |
| GET | /api/versions?limit&cursor | Yes | — | `{ keys: [...], cursor? }` |
| GET | /api/versions/:id | Yes | — | `{ id, content, message, createdAt, contentHash }` |
| POST | /api/versions/:id/rollback | Yes | — | `{ versionId, contentHash, createdAt }` |
| GET | /api/headers | Yes | — | `{ "Header-Name": "value" }` |
| PUT | /api/headers | Yes | `{ "Header-Name": "value" }` | `{ ...headers }` |
| GET | / | No | — | YAML text (Content-Type: text/yaml) |
| GET | /download | No | — | YAML file download |

Auth: `Authorization: Bearer <token>` header. Returns 401 if invalid or expired.

## Project Structure

```
clash-config-manager/
├── wrangler.toml          # Worker config (KV, assets, secrets)
├── package.json           # Project dependencies (Worker + Admin)
├── tsconfig.json          # Worker TypeScript config
├── src/
│   ├── index.ts           # Worker entry (Hono routes)
│   ├── storage.ts         # KV storage layer (ULID, SHA-256, version CRUD)
│   ├── auth.ts            # JWT generation/verification (Web Crypto HMAC-SHA256)
│   └── types.ts           # TypeScript interfaces
├── admin/
│   ├── vite.config.ts     # Vite config (proxy, build)
│   ├── tsconfig.json      # Admin TypeScript config
│   ├── index.html         # SPA entry
│   └── src/
│       ├── main.ts        # App shell + hash router
│       ├── api.ts         # Typed API client
│       ├── auth.ts        # Token management (localStorage)
│       ├── login.ts       # Login form
│       ├── editor.ts      # CodeMirror 6 YAML editor
│       ├── versions.ts    # Version list + diff + rollback
│       ├── headers.ts     # Custom response headers editor
│       ├── toast.ts       # Toast notifications
│       └── style.css      # Dark theme styles
├── .dev.vars              # Local dev secrets
└── .gitignore
```

## KV Data Model

| Key | Value | Description |
|-----|-------|-------------|
| `config:current` | `{ versionId, updatedAt }` | Pointer to latest version |
| `version:<ulid>` | `{ id, content, message, createdAt, contentHash }` | Version snapshot |
| `headers:config` | `{ "Header-Name": "value" }` | Custom response headers |

## Features

- **Online YAML Editor** — CodeMirror 6 with YAML syntax highlighting and real-time validation
- **Version Control** — Every save creates an immutable version snapshot with ULID, content hash, and timestamp
- **Diff View** — Compare any two versions with unified diff rendering
- **One-click Rollback** — Rollback creates a new version with old content (never deletes history)
- **Custom Response Headers** — Configure headers like `Cache-Control`, `X-Custom-Header`, etc.
- **JWT Authentication** — HMAC-SHA256 signed tokens with 7-day expiry
- **Draft Auto-save** — Editor drafts saved to localStorage every 30 seconds
- **Dark Theme** — Full dark UI with CSS custom properties
- **Mobile Responsive** — Works on desktop and mobile browsers
