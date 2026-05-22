import { Hono } from 'hono'
import { generateToken, verifyToken } from '../auth'
import { safeParseJson, setAuthCookies } from '../utils/response'
import {
  checkRateLimit,
  getClientIdentifier,
  recordFailedAttempt,
  timingSafeEqual,
} from '../utils/security'
import { AUTH_CONFIG } from '../types'
import type { Env } from '../types'

export const authRoutes = new Hono<{ Bindings: Env }>()

authRoutes.post('/login', async (c) => {
  const identifier = getClientIdentifier(c.req.raw.headers)
  const limit = await checkRateLimit(c.env.KV, identifier)
  if (!limit.allowed) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  const body = await safeParseJson<{ password?: string }>(c)
  if (!body || typeof body.password !== 'string') {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const passwordOk = await timingSafeEqual(body.password, c.env.ADMIN_PASSWORD)
  if (!passwordOk) {
    await recordFailedAttempt(c.env.KV, identifier)
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await generateToken(c.env.TOKEN_SECRET)
  const payload = await verifyToken(c.env.TOKEN_SECRET, token)

  if (!payload) {
    return c.json({ error: 'Failed to issue token' }, 500)
  }

  const expiresAt = new Date(payload.exp * 1000).toISOString()
  setAuthCookies(c, token, expiresAt)

  return c.json({
    token,
    expiresAt,
  })
})

authRoutes.post('/verify', async (c) => {
  const body = await safeParseJson<{ token?: string }>(c)
  if (!body || typeof body.token !== 'string') {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const payload = await verifyToken(c.env.TOKEN_SECRET, body.token)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  return c.json({
    valid: true,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  })
})

authRoutes.post('/logout', async (c) => {
  c.header(
    'Set-Cookie',
    `${AUTH_CONFIG.COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    {
      append: true,
    },
  )
  c.header(
    'Set-Cookie',
    `${AUTH_CONFIG.COOKIE_EXPIRES_NAME}=; Path=/; Secure; SameSite=Strict; Max-Age=0`,
    {
      append: true,
    },
  )
  return c.json({ ok: true })
})
