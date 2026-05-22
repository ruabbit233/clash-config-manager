# AGENTS.md

Repo-specific notes for OpenCode / agent sessions. README.md covers product, API, and high-level layout — read it first. This file only captures things that bite if you don't know them.

## Layout (the part that matters)

This is a **single Cloudflare Worker** (`src/`) plus a **Vite SPA** (`admin/`) served as static assets by the Worker. They are two TypeScript projects with different tsconfigs in one npm workspace (no actual workspaces — flat root `package.json`).

- `src/**/*.ts` — Worker. `tsconfig.json`. **No DOM lib.** `types: ["@cloudflare/workers-types"]`, `jsxImportSource: "hono/jsx"`. Uses `crypto.subtle`, `KVNamespace`, `Fetcher`, etc.
- `admin/src/**/*.ts` — Browser SPA. `admin/tsconfig.json`. DOM lib, **stricter** (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
- `shared/types.ts` — types used by both sides. Keep this DOM-free and Worker-runtime-free (plain types only).

Importing `document`/`window`/etc. from `src/` will fail typecheck. Don't import anything Node-only either; Worker runtime ≠ Node.

## `@shared/*` alias is configured in FOUR places

If you move/rename files under `shared/`, update all four or builds/tests will break inconsistently:

1. `tsconfig.json` → `paths`
2. `admin/tsconfig.json` → `paths`
3. `vitest.config.ts` → `resolve.alias`
4. `admin/vite.config.ts` → `resolve.alias`

Wrangler resolves `@shared/*` via the root `tsconfig.json` paths.

## Commands

| Task | Command | Notes |
|---|---|---|
| Worker dev | `npm run dev` | `wrangler dev` on :8787. Needs `.dev.vars` (gitignored — create it). |
| Admin dev | `npm run dev:admin` | Vite on :5173, proxies `/api/*` and `/download` to :8787. Run **alongside** Worker dev. |
| Lint | `npm run lint` | ESLint on `src` + `admin/src` only. |
| Format check | `npm run format:check` | CI runs this — formatting drift fails CI. |
| Format write | `npm run format` | Prettier covers `src/**/*.ts`, `admin/src/**/*.ts`, `admin/vite.config.ts`. CSS, README, configs are NOT auto-formatted. |
| Test (watch) | `npm run test` | Vitest. |
| Test (CI) | `npm run test:run` | What CI runs. |
| Build | `npm run build` | Builds admin SPA into `admin/dist/`. Wrangler runs this automatically on deploy via `[build]` in `wrangler.toml`. |
| Deploy | `npm run deploy` | `wrangler deploy`. Triggers `npm run build` first. |

**No `typecheck` script exists.** To typecheck both projects manually:

```bash
npx tsc --noEmit                          # Worker (uses ./tsconfig.json)
npx tsc -p admin/tsconfig.json --noEmit   # Admin SPA
```

CI does **not** run a standalone typecheck — it relies on `vite build` + ESLint to catch issues. If you change types-only code, run both `tsc` invocations yourself before claiming done.

**CI order** (`.github/workflows/ci.yml`): `format:check` → `lint` → `test:run` → `build`. All must pass on Node 20.

## Run a single test

```bash
npx vitest run src/auth.test.ts
npx vitest run -t "should reject expired tokens"   # by test name
```

Vitest is configured with `globals: true`, but the codebase still imports `describe`/`it`/`expect` explicitly — match that style.

## Style conventions (Prettier — easy to break)

`.prettierrc`: **no semicolons**, single quotes, `tabWidth: 2`, `trailingComma: "all"`, `printWidth: 100`. ESLint extends `eslint-config-prettier`, so don't add stylistic ESLint rules — Prettier owns formatting.

Other conventions visible in the codebase:
- Arrow functions over `function` declarations for module-level helpers.
- `const` config objects with `as const` (see `AUTH_CONFIG`, `STORAGE_CONFIG`, `HEADER_CONFIG` in `src/types.ts`).
- Re-export shared types from `src/types.ts` rather than importing `@shared/types` deep in the Worker code.
- ESLint `no-explicit-any` is **warn**, not error — but don't add new `any`s; the codebase avoids them.
- Unused vars/args allowed when prefixed with `_`.

## Security gotchas

- **Never compare secrets with `===`.** Use `timingSafeEqual` from `src/utils/security.ts` (SHA-256 + XOR, length-safe).
- Login route must call `checkRateLimit` before password check and `recordFailedAttempt` on failure (see `src/routes/auth.ts`). KV-backed per-IP, 10 attempts / 15 min window.
- Tokens are JWT HS256 via Web Crypto in `src/auth.ts` — do **not** pull in `jsonwebtoken` or similar Node libs; they don't run on Workers.
- Auth is checked by `app.use('/api/*', authGuard)` in `src/index.ts`. `authGuard` internally allowlists `/api/auth/login` and `/api/auth/verify` via `publicPaths`. New unauthenticated `/api/...` endpoints must be added to that set.

## Wrangler / Worker quirks

- `wrangler.toml` has `run_worker_first = true` — the Worker sees every request first, including `/admin*`. Static assets are served via the catch-all `app.all('*', c => c.env.ASSETS.fetch(c.req.raw))` at the bottom of `src/index.ts`. Add new API routes **above** that catch-all.
- `not_found_handling = "single-page-application"` — unknown admin paths fall back to `admin/dist/index.html`.
- `[[kv_namespaces]]` in `wrangler.toml` has no `id` committed. You must `npx wrangler kv namespace create "CONFIG_KV"` and paste the ID before `npm run deploy` works for a fresh checkout.
- `.dev.vars` is gitignored. For local dev set `ADMIN_PASSWORD` and `TOKEN_SECRET` (≥32 chars) there.
- `compatibility_date = "2026-04-27"`, `nodejs_compat` flag is on. Most Node built-ins still won't work — prefer Web APIs (`crypto.subtle`, `TextEncoder`, etc.).

## KV data model (don't reinvent)

See `STORAGE_CONFIG` in `src/types.ts` for the exact key prefixes. Versions use ULID (custom impl in `src/storage.ts`, not a library) and SHA-256 content hashes. Listing uses KV cursor pagination; results are sorted by ULID descending in `src/storage.ts`. Don't add a different ID scheme.

## Don't

- Don't add a Node-only dependency to runtime code (`fs`, `path`, `jsonwebtoken`, `bcrypt`, …). It will fail at deploy or runtime.
- Don't introduce a second package manager or workspace tool — flat npm only.
- Don't commit `.dev.vars`, `.wrangler/`, or `admin/dist/` (already gitignored).
- Don't suppress type errors with `as any` / `@ts-ignore`. The codebase has zero of these — keep it that way.
- Don't add semicolons or double quotes; Prettier will revert on next format and CI's `format:check` will fail in the meantime.
