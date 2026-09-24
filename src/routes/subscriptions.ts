import { Hono } from 'hono'
import { createSubscription, isSubscriptionName, listSubscriptions } from '../storage'
import type { Env } from '../types'
import { safeParseJson } from '../utils/response'
import { requireSubscription } from '../utils/subscription'
import { configRoutes } from './config'
import { headerRoutes } from './headers'
import { versionRoutes } from './versions'

export const subscriptionRoutes = new Hono<{ Bindings: Env }>()

subscriptionRoutes.get('/', async (c) => c.json(await listSubscriptions(c.env.KV)))

subscriptionRoutes.post('/', async (c) => {
  const body = await safeParseJson<{ name?: unknown }>(c)
  if (!body || typeof body.name !== 'string' || !isSubscriptionName(body.name)) {
    return c.json(
      {
        error:
          'Name must be 1–64 letters, digits, underscores or hyphens, starting with a letter or digit',
      },
      400,
    )
  }
  const subscription = await createSubscription(c.env.KV, body.name)
  if (!subscription) return c.json({ error: 'Subscription already exists' }, 409)
  return c.json(subscription, 201)
})

subscriptionRoutes.use('/:subscription/*', requireSubscription)
subscriptionRoutes.route('/:subscription/config', configRoutes)
subscriptionRoutes.route('/:subscription/versions', versionRoutes)
subscriptionRoutes.route('/:subscription/headers', headerRoutes)
