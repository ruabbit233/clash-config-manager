import { Hono } from "hono";
import type { Context, Next } from "hono";
import { parseDocument } from "yaml";
import { generateToken, verifyToken } from "./auth";
import { checkRateLimit } from "./rate-limit";
import {
  getCurrent,
  getHeaders,
  getVersion,
  listVersions,
  saveVersion,
  setHeaders,
} from "./storage";
import { AUTH_CONFIG, HEADER_CONFIG, STORAGE_CONFIG } from "./types";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error("Unhandled error:", err.message, err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

const createYamlResponse = async (
  c: Context<{ Bindings: Env }>,
  asDownload: boolean,
) => {
  const current = await getCurrent(c.env.KV);
  if (!current) {
    return c.text("No config found", 404, { "Content-Type": "text/plain" });
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/yaml; charset=utf-8");

  const customHeaders = await getHeaders(c.env.KV);
  for (const [name, value] of Object.entries(customHeaders)) {
    headers.set(name, value);
  }

  if (asDownload) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${HEADER_CONFIG.DOWNLOAD_FILENAME}"`,
    );
  }

  return new Response(current.content, {
    status: 200,
    headers,
  });
};

app.get("/", async (c) => {
  const ua = c.req.header("User-Agent") ?? "";
  if (!/clash/i.test(ua)) {
    return c.notFound();
  }
  return createYamlResponse(c, false);
});
app.get("/download", async (c) => createYamlResponse(c, true));

const safeParseJson = async <T>(c: Context<{ Bindings: Env }>): Promise<T | null> => {
  try {
    return await c.req.json<T>();
  } catch (err) {
    console.error("JSON parse error:", err instanceof Error ? err.message : String(err));
    return null;
  }
};

const resolveToken = async (
  c: Context<{ Bindings: Env }>,
): Promise<string | null> => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookieHeader = c.req.header("Cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_CONFIG.COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
};

const publicPaths = new Set(["/api/auth/login", "/api/auth/verify"]);

app.use("/api/*", async (c, next: Next) => {
  const pathname = new URL(c.req.url).pathname;
  if (publicPaths.has(pathname)) {
    return next();
  }

  const token = await resolveToken(c);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401, {
      "WWW-Authenticate": 'Bearer realm="clash-config-manager"',
    });
  }

  const payload = await verifyToken(c.env.TOKEN_SECRET, token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401, {
      "WWW-Authenticate": 'Bearer realm="clash-config-manager"',
    });
  }

  return next();
});

const setAuthCookies = (
  c: Context<{ Bindings: Env }>,
  token: string,
  expiresAt: string,
) => {
  const maxAge = AUTH_CONFIG.TOKEN_EXPIRY_SECONDS;
  const cookieOpts = `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
  c.header("Set-Cookie", `${AUTH_CONFIG.COOKIE_NAME}=${token}; ${cookieOpts}`, {
    append: true,
  });
  const expiresCookieOpts = `Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}`;
  c.header(
    "Set-Cookie",
    `${AUTH_CONFIG.COOKIE_EXPIRES_NAME}=${encodeURIComponent(expiresAt)}; ${expiresCookieOpts}`,
    { append: true },
  );
};

app.post("/api/auth/login", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Real-IP") ?? "unknown";
  const rateLimit = checkRateLimit(
    ip,
    AUTH_CONFIG.RATE_LIMIT_MAX_ATTEMPTS,
    AUTH_CONFIG.RATE_LIMIT_WINDOW_SECONDS,
  );

  c.header("X-RateLimit-Remaining", String(rateLimit.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));

  if (!rateLimit.allowed) {
    return c.json(
      { error: "Too many login attempts. Please try again later." },
      429,
      {
        "Retry-After": String(
          Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        ),
      },
    );
  }

  const body = await safeParseJson<{ password?: string }>(c);
  if (!body || typeof body.password !== "string") {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (body.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await generateToken(c.env.TOKEN_SECRET);
  const payload = await verifyToken(c.env.TOKEN_SECRET, token);

  if (!payload) {
    return c.json({ error: "Failed to issue token" }, 500);
  }

  const expiresAt = new Date(payload.exp * 1000).toISOString();
  setAuthCookies(c, token, expiresAt);

  return c.json({
    token,
    expiresAt,
  });
});

app.post("/api/auth/verify", async (c) => {
  const body = await safeParseJson<{ token?: string }>(c);
  if (!body || typeof body.token !== "string") {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const payload = await verifyToken(c.env.TOKEN_SECRET, body.token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  return c.json({
    valid: true,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  });
});

app.post("/api/auth/logout", async (c) => {
  c.header("Set-Cookie", `${AUTH_CONFIG.COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, {
    append: true,
  });
  c.header("Set-Cookie", `${AUTH_CONFIG.COOKIE_EXPIRES_NAME}=; Path=/; Secure; SameSite=Strict; Max-Age=0`, {
    append: true,
  });
  return c.json({ ok: true });
});

app.get("/api/config", async (c) => {
  const current = await getCurrent(c.env.KV);
  if (!current) {
    return c.json({ error: "No config found" }, 404);
  }

  return c.json({
    content: current.content,
    versionId: current.versionId,
    updatedAt: current.updatedAt,
  });
});

app.put("/api/config", async (c) => {
  const body = await safeParseJson<{ content?: string; message?: string }>(c);

  if (!body || typeof body.content !== "string") {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const doc = parseDocument(body.content);
  if (doc.errors.length > 0) {
    return c.json(
      {
        success: false,
        error: "Invalid YAML",
        details: doc.errors.map((item) => item.message),
      },
      400,
    );
  }

  const snapshot = await saveVersion(
    c.env.KV,
    body.content,
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : "Update config",
  );

  return c.json({
    versionId: snapshot.id,
    contentHash: snapshot.contentHash,
    createdAt: snapshot.createdAt,
  });
});

app.get("/api/versions", async (c) => {
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
  const limit = Number.isNaN(parsed) ? STORAGE_CONFIG.DEFAULT_PAGE_LIMIT : Math.max(parsed, 1);

  const versions = await listVersions(c.env.KV, limit, cursor);
  return c.json(versions);
});

app.get("/api/versions/:id", async (c) => {
  const id = c.req.param("id");
  const version = await getVersion(c.env.KV, id);
  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json(version);
});

app.post("/api/versions/:id/rollback", async (c) => {
  const id = c.req.param("id");
  const version = await getVersion(c.env.KV, id);
  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  const rollback = await saveVersion(
    c.env.KV,
    version.content,
    `Rollback to version ${id.slice(0, 8)}`,
  );

  return c.json({
    versionId: rollback.id,
    contentHash: rollback.contentHash,
    createdAt: rollback.createdAt,
  });
});

app.get("/api/headers", async (c) => {
  const headers = await getHeaders(c.env.KV);
  return c.json(headers);
});

app.put("/api/headers", async (c) => {
  const body = await safeParseJson<Record<string, unknown>>(c);
  if (!body || Array.isArray(body)) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const nextHeaders: Record<string, string> = {};

  for (const [name, value] of Object.entries(body)) {
    if (!HEADER_CONFIG.NAME_PATTERN.test(name)) {
      return c.json({ error: `Invalid header name: ${name}` }, 400);
    }

    if (typeof value !== "string") {
      return c.json({ error: `Invalid header value for: ${name}` }, 400);
    }

    if (value.length > HEADER_CONFIG.MAX_HEADER_VALUE_LENGTH) {
      return c.json(
        { error: `Header value too long for: ${name} (max ${HEADER_CONFIG.MAX_HEADER_VALUE_LENGTH} chars)` },
        400,
      );
    }
  }

  Object.assign(nextHeaders, body as Record<string, string>);

  await setHeaders(c.env.KV, nextHeaders);

  return c.json(nextHeaders);
});

app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
