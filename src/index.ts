import { Hono } from "hono";
import type { Context, Next } from "hono";
import { parseDocument } from "yaml";
import { generateToken, verifyToken } from "./auth";
import {
  getCurrent,
  getHeaders,
  getVersion,
  listVersions,
  saveVersion,
  setHeaders,
} from "./storage";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

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
    headers.set("Content-Disposition", 'attachment; filename="clash-config.yaml"');
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

const publicPaths = new Set(["/api/auth/login", "/api/auth/verify"]);

app.use("/api/*", async (c, next: Next) => {
  const pathname = new URL(c.req.url).pathname;
  if (publicPaths.has(pathname)) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401, {
      "WWW-Authenticate": 'Bearer realm="clash-config-manager"',
    });
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(c.env.TOKEN_SECRET, token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401, {
      "WWW-Authenticate": 'Bearer realm="clash-config-manager"',
    });
  }

  return next();
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => null);
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

  return c.json({
    token,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  });
});

app.post("/api/auth/verify", async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => null);
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
  const body = await c.req
    .json<{ content?: string; message?: string }>()
    .catch(() => null);

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
  const limit = Number.isNaN(parsed) ? 20 : Math.max(parsed, 1);

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
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body)) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const nextHeaders: Record<string, string> = {};
  const namePattern = /^[a-zA-Z0-9-]+$/;

  for (const [name, value] of Object.entries(body)) {
    if (!namePattern.test(name)) {
      return c.json({ error: `Invalid header name: ${name}` }, 400);
    }

    if (typeof value !== "string") {
      return c.json({ error: `Invalid header value for: ${name}` }, 400);
    }

    nextHeaders[name] = value;
  }

  await setHeaders(c.env.KV, nextHeaders);

  return c.json(nextHeaders);
});

app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
