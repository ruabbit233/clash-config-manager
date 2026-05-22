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

/**
 * ETag uses versionId (immutable per save) instead of content-hash to avoid a
 * second KV read. `If-None-Match` short-circuits to 304 before we touch storage,
 * so high-frequency Clash polling hits the CDN cache.
 *
 * Custom headers are applied LAST so they may intentionally override defaults
 * like Cache-Control (e.g. user wants `no-store`).
 */
export const createYamlResponse = async (
  c: Context<{ Bindings: Env }>,
  asDownload: boolean,
): Promise<Response> => {
  const current = await getCurrent(c.env.KV)
  if (!current) {
    return c.text('No config found', 404, { 'Content-Type': 'text/plain' })
  }

  const etag = `"${current.versionId}"`

  if (!asDownload) {
    const ifNoneMatch = c.req.header('If-None-Match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'public, max-age=60' },
      })
    }
  }

  const headers = new Headers()
  headers.set('Content-Type', 'text/yaml; charset=utf-8')

  if (!asDownload) {
    headers.set('ETag', etag)
    headers.set('Cache-Control', 'public, max-age=60')
    headers.set('Last-Modified', new Date(current.updatedAt).toUTCString())
  }

  if (asDownload) {
    headers.set('Content-Disposition', `attachment; filename="${HEADER_CONFIG.DOWNLOAD_FILENAME}"`)
  }

  const customHeaders = await getHeaders(c.env.KV)
  for (const [name, value] of Object.entries(customHeaders)) {
    headers.set(name, String(value))
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
