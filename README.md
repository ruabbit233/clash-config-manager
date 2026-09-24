# Clash Config Manager

A Cloudflare Workers-based Clash YAML configuration manager with a web admin panel.

**Public endpoint**: `https://example.com` — serves the latest YAML config with custom response headers.

**Admin panel**: `https://example.com/admin` — online YAML editor, version control, and response headers management.

## Architecture

```
Single Cloudflare Worker
├── GET /              → YAML config (public, custom headers from KV)
├── GET /download      → YAML config as file download
├── GET /bus/:path     → Named subscription YAML config
├── GET /bus/:path/download → Named subscription file download
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
| PATCH | /api/versions/:id | Yes | `{ message }` | `{ id, message, createdAt, contentHash }` |
| DELETE | /api/versions/:id | Yes | — | `204 No Content` (`409` if it is the current version) |
| POST | /api/versions/:id/rollback | Yes | — | `{ versionId, contentHash, createdAt }` |
| GET | /api/headers | Yes | — | `{ "Header-Name": "value" }` |
| PUT | /api/headers | Yes | `{ "Header-Name": "value" }` | `{ ...headers }` |
| GET | / | No | — | YAML text (Content-Type: text/yaml) |
| GET | /download | No | — | YAML file download |

Auth: `Authorization: Bearer <token>` header. Returns 401 if invalid or expired.

## Multiple subscriptions

In the admin sidebar, click **新增订阅**, enter a display name (for example `家庭订阅`) and a separate path (for example `abcdefgh`), then edit and save its YAML. The dialog offers a random path and previews the public URL. Use the subscription selector to switch between configurations. **复制订阅地址** copies the selected subscription URL; the editor's download button downloads that subscription.

- `/bus/abcdefgh` and `/bus/abcdefgh/` serve its current YAML without admin authentication or a User-Agent restriction.
- `/bus/abcdefgh/download` downloads the same YAML as `abcdefgh.yaml`.
- The default subscription retains `/` (Clash User-Agent required) and `/download`, with its existing data unchanged. No migration is required.
- Configurations, version history, rollbacks, custom response headers, and browser drafts are isolated per subscription. New subscriptions start with empty `proxies`, `proxy-groups`, and `rules` lists.
- Display names support Chinese and spaces, are trimmed, and must contain 1–128 characters with no control characters. Different subscriptions may share a display name; the selector also shows the path to distinguish them.
- Paths are case-sensitive, 1–64 ASCII letters, digits, underscores or hyphens, starting with a letter or digit. Paths are unique and fixed after creation. An existing path returns `409`; unknown subscriptions return `404`.
- **重命名** changes only the display name; public links, content, version history, headers, and drafts keep the same path. Unsaved editor changes are preserved when renaming.
- **删除订阅** asks for confirmation, removes the configuration, all version history, and headers, and clears this browser's draft. The UI switches back to the default subscription. The default subscription cannot be renamed or deleted through these controls.
- Existing subscriptions automatically use their original name as both name and path on read, so no migration is needed. The original `{ "name": "abcdefgh" }` create request remains supported for older clients.

Admin APIs (all require authentication):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/subscriptions` | List named subscriptions (`[{ name, path, createdAt }]`); the default subscription is implicit |
| POST | `/api/subscriptions` | Create with `{ "name": "家庭订阅", "path": "abcdefgh" }` |
| PATCH | `/api/subscriptions/:path` | Rename with `{ "name": "工作订阅" }`; does not change the path |
| DELETE | `/api/subscriptions/:path` | Delete configuration, all versions and headers (`204` on success, `404` if absent) |
| GET / PUT | `/api/subscriptions/:path/config` | Read / save YAML |
| GET | `/api/subscriptions/:path/versions` | List versions with `limit` / `cursor` |
| GET / PATCH / DELETE | `/api/subscriptions/:path/versions/:id` | Read / annotate / delete a version |
| POST | `/api/subscriptions/:path/versions/:id/rollback` | Roll back within this subscription |
| GET / PUT | `/api/subscriptions/:path/headers` | Read / save this subscription's response headers |

The scoped config, version, and header APIs use the same request/response formats as the default APIs above. Data uses Cloudflare KV and shares its eventual-consistency behavior; changes may take time to propagate across regions.

## Project Structure

```
clash-config-manager/
├── wrangler.toml              # Worker config (KV, assets, secrets)
├── package.json               # Project dependencies (Worker + Admin)
├── tsconfig.json              # Worker TypeScript config
├── shared/
│   └── types.ts               # Shared types (VersionSnapshot, HeadersConfig, etc.)
├── src/
│   ├── index.ts               # Worker entry (app init, route mounting)
│   ├── auth.ts                # JWT generation/verification (Web Crypto HMAC-SHA256)
│   ├── storage.ts             # KV storage layer (ULID, SHA-256, version CRUD)
│   ├── types.ts               # Re-exports shared types + backend-only types/configs
│   ├── routes/
│   │   ├── auth.ts            # /api/auth/* routes (login, verify, logout)
│   │   ├── config.ts          # /api/config routes (GET, PUT)
│   │   ├── versions.ts        # /api/versions/* routes (list, get, rollback, patch, delete)
│   │   ├── headers.ts         # /api/headers routes (GET, PUT)
│   │   └── public.ts          # GET / and /download public endpoints
│   ├── middleware/
│   │   └── auth.ts            # JWT auth guard middleware
│   └── utils/
│       └── response.ts        # Shared helpers (safeParseJson, createYamlResponse, setAuthCookies)
├── admin/
│   ├── vite.config.ts         # Vite config (proxy, build, @shared alias)
│   ├── tsconfig.json          # Admin TypeScript config
│   ├── index.html             # SPA entry
│   └── src/
│       ├── main.ts            # App shell + hash router + page lifecycle
│       ├── page.ts            # Page interface (mount/unmount/isDirty)
│       ├── api.ts             # Typed API client
│       ├── auth.ts            # Token management (memory + cookie)
│       ├── i18n.ts            # i18n loader
│       ├── locales/
│       │   └── zh-CN.ts       # Chinese translations
│       ├── login.ts           # Login page
│       ├── editor.ts          # CodeMirror 6 YAML editor page
│       ├── versions.ts        # Version list + diff + rollback page
│       ├── headers.ts         # Custom response headers editor page
│       ├── modal.ts           # Confirm/prompt modal
│       ├── toast.ts           # Toast notifications
│       ├── icons.ts           # SVG icon constants
│       ├── dom.ts             # DOM query helpers
│       └── styles/
│           ├── tokens.css     # CSS custom properties (design tokens)
│           ├── base.css       # Reset & base styles
│           ├── layout.css     # App shell (sidebar, header, content)
│           ├── components.css # Buttons, forms, cards, table, modal, toast, etc.
│           ├── login.css      # Login page styles
│           ├── editor.css     # Editor page + CodeMirror styles
│           ├── versions.css   # Versions page styles
│           ├── headers.css    # Headers page styles
│           └── responsive.css # Media queries & animations
├── .dev.vars                  # Local dev secrets
└── .gitignore
```

## KV Data Model

| Key | Value | Description |
|-----|-------|-------------|
| `config:current` | `{ versionId, updatedAt }` | Pointer to latest version |
| `version:<ulid>` | `{ id, content, message, createdAt, contentHash }` | Version snapshot |
| `headers:config` | `{ "Header-Name": "value" }` | Custom response headers |
| `subscription-meta:<path>` | `{ name, path, createdAt }` | Subscription registry; also stored as KV metadata for listing |
| `subscription:<path>:config:current` | `{ versionId, updatedAt }` | Named subscription current pointer |
| `subscription:<path>:version:<ulid>` | Version snapshot | Named subscription version history |
| `subscription:<path>:headers:config` | `{ "Header-Name": "value" }` | Named subscription custom response headers |

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
