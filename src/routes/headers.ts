import { Hono } from 'hono'
import { safeParseJson } from '../utils/response'
import { getHeaders, setHeaders } from '../storage'
import { HEADER_CONFIG } from '../types'
import type { Env } from '../types'

export const headerRoutes = new Hono<{ Bindings: Env }>()

headerRoutes.get('/', async (c) => {
  const headers = await getHeaders(c.env.KV)
  return c.json(headers)
})

headerRoutes.put('/', async (c) => {
  const body = await safeParseJson<Record<string, unknown>>(c)
  if (!body || Array.isArray(body)) {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const nextHeaders: Record<string, string> = {}

  for (const [name, value] of Object.entries(body)) {
    if (!HEADER_CONFIG.NAME_PATTERN.test(name)) {
      return c.json({ error: `Invalid header name: ${name}` }, 400)
    }

    if (typeof value !== 'string') {
      return c.json({ error: `Invalid header value for: ${name}` }, 400)
    }

    if (value.length > HEADER_CONFIG.MAX_HEADER_VALUE_LENGTH) {
      return c.json(
        {
          error: `Header value too long for: ${name} (max ${HEADER_CONFIG.MAX_HEADER_VALUE_LENGTH} chars)`,
        },
        400,
      )
    }
  }

  Object.assign(nextHeaders, body as Record<string, string>)

  await setHeaders(c.env.KV, nextHeaders)

  return c.json(nextHeaders)
})
