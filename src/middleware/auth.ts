import type { Context, Next } from 'hono'
import { verifyToken } from '../auth'
import { AUTH_CONFIG } from '../types'
import type { Env } from '../types'

export const resolveToken = async (c: Context<{ Bindings: Env }>): Promise<string | null> => {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_CONFIG.COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}

export const publicPaths = new Set(['/api/auth/login', '/api/auth/verify'])

export const authGuard = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const pathname = new URL(c.req.url).pathname
  if (publicPaths.has(pathname)) {
    return next()
  }

  const token = await resolveToken(c)
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401, {
      'WWW-Authenticate': 'Bearer realm="clash-config-manager"',
    })
  }

  const payload = await verifyToken(c.env.TOKEN_SECRET, token)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401, {
      'WWW-Authenticate': 'Bearer realm="clash-config-manager"',
    })
  }

  return next()
}
