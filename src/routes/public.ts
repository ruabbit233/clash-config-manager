import { Hono } from 'hono'
import { createYamlResponse } from '../utils/response'
import type { Env } from '../types'

export const publicRoutes = new Hono<{ Bindings: Env }>()

publicRoutes.get('/', async (c) => {
  const ua = c.req.header('User-Agent') ?? ''
  if (!/clash/i.test(ua)) {
    return c.notFound()
  }
  return createYamlResponse(c, false)
})

publicRoutes.get('/download', async (c) => createYamlResponse(c, true))
