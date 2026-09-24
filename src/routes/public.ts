import { Hono } from 'hono'
import { createYamlResponse } from '../utils/response'
import type { Env } from '../types'
import { requireSubscription } from '../utils/subscription'

export const publicRoutes = new Hono<{ Bindings: Env }>()

publicRoutes.get('/', async (c) => {
  const ua = c.req.header('User-Agent') ?? ''
  if (!/clash/i.test(ua)) {
    return c.notFound()
  }
  return createYamlResponse(c, false)
})

publicRoutes.get('/download', async (c) => createYamlResponse(c, true))

publicRoutes.get('/bus/:subscription', requireSubscription, (c) =>
  createYamlResponse(c, false, c.req.param('subscription')),
)
publicRoutes.get('/bus/:subscription/', requireSubscription, (c) =>
  createYamlResponse(c, false, c.req.param('subscription')),
)
publicRoutes.get('/bus/:subscription/download', requireSubscription, (c) =>
  createYamlResponse(c, true, c.req.param('subscription')),
)
