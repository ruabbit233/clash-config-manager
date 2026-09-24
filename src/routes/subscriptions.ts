import { Hono } from 'hono'
import {
  createSubscription,
  deleteSubscription,
  isSubscriptionName,
  isSubscriptionPath,
  listSubscriptions,
  updateSubscription,
} from '../storage'
import type { Env } from '../types'
import { safeParseJson } from '../utils/response'
import { requireSubscription } from '../utils/subscription'
import { configRoutes } from './config'
import { headerRoutes } from './headers'
import { versionRoutes } from './versions'

export const subscriptionRoutes = new Hono<{ Bindings: Env }>()

subscriptionRoutes.get('/', async (c) => c.json(await listSubscriptions(c.env.KV)))

subscriptionRoutes.post('/', async (c) => {
  const body = await safeParseJson<{ name?: unknown; path?: unknown }>(c)
  // Accept the original { name } API for existing clients using slug-like names.
  const path = body?.path === undefined ? body?.name : body.path
  if (
    !body ||
    typeof body.name !== 'string' ||
    typeof path !== 'string' ||
    !isSubscriptionName(body.name) ||
    !isSubscriptionPath(path)
  ) {
    return c.json(
      {
        error:
          'Name is required (1–128 characters); path must be 1–64 letters, digits, underscores or hyphens, starting with a letter or digit',
      },
      400,
    )
  }
  const subscription = await createSubscription(c.env.KV, body.name, path)
  if (!subscription) return c.json({ error: 'Subscription already exists' }, 409)
  return c.json(subscription, 201)
})

subscriptionRoutes.patch('/:subscription', async (c) => {
  const body = await safeParseJson<{ name?: unknown; path?: unknown }>(c)
  if (!body || typeof body.name !== 'string' || !isSubscriptionName(body.name)) {
    return c.json({ error: 'A valid name is required' }, 400)
  }
  if (body.path !== undefined && body.path !== c.req.param('subscription')) {
    return c.json({ error: 'Subscription path cannot be changed' }, 400)
  }
  const updated = await updateSubscription(c.env.KV, c.req.param('subscription'), body.name)
  if (!updated) return c.json({ error: 'Subscription not found' }, 404)
  return c.json(updated)
})

subscriptionRoutes.delete('/:subscription', async (c) => {
  const deleted = await deleteSubscription(c.env.KV, c.req.param('subscription'))
  if (!deleted) return c.json({ error: 'Subscription not found' }, 404)
  return c.body(null, 204)
})

subscriptionRoutes.use('/:subscription/*', requireSubscription)
subscriptionRoutes.route('/:subscription/config', configRoutes)
subscriptionRoutes.route('/:subscription/versions', versionRoutes)
subscriptionRoutes.route('/:subscription/headers', headerRoutes)
