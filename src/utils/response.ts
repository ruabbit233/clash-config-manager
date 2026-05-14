import type { Context } from 'hono'
import { getCurrent, getHeaders } from '../storage'
import { AUTH_CONFIG, HEADER_CONFIG } from '../types'
import type { Env } from '../types'

export const safeParseJson = async <T>(c: Context<{ Bindings: Env }>): Promise<T | null> => {
  try {
    return await c.req.json<T>()
  } catch (err) {
    console.error('JSON parse error:', err instanceof Error ? err.message : String(err))
    return null
  }
}

export const createYamlResponse = async (
  c: Context<{ Bindings: Env }>,
  asDownload: boolean,
): Promise<Response> => {
  const current = await getCurrent(c.env.KV)
  if (!current) {
    return c.text('No config found', 404, { 'Content-Type': 'text/plain' })
  }

  const headers = new Headers()
  headers.set('Content-Type', 'text/yaml; charset=utf-8')

  const customHeaders = await getHeaders(c.env.KV)
  for (const [name, value] of Object.entries(customHeaders)) {
    headers.set(name, String(value))
  }

  if (asDownload) {
    headers.set('Content-Disposition', `attachment; filename="${HEADER_CONFIG.DOWNLOAD_FILENAME}"`)
  }

  return new Response(current.content, {
    status: 200,
    headers,
  })
}

export const setAuthCookies = (c: Context<{ Bindings: Env }>, token: string, expiresAt: string) => {
  const maxAge = AUTH_CONFIG.TOKEN_EXPIRY_SECONDS
  const cookieOpts = `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  c.header('Set-Cookie', `${AUTH_CONFIG.COOKIE_NAME}=${token}; ${cookieOpts}`, {
    append: true,
  })
  const expiresCookieOpts = `Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}`
  c.header(
    'Set-Cookie',
    `${AUTH_CONFIG.COOKIE_EXPIRES_NAME}=${encodeURIComponent(expiresAt)}; ${expiresCookieOpts}`,
    { append: true },
  )
}
