import type { Context, Next } from 'hono'
import { getSubscription } from '../storage'
import type { Env } from '../types'

// The same config/version/header handlers serve both legacy and named subscriptions.
export const subscriptionScope = (c: Context<{ Bindings: Env }>): string | undefined =>
  c.req.param('subscription')

export const requireSubscription = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const name = subscriptionScope(c)
  if (!name || !(await getSubscription(c.env.KV, name))) {
    return c.json({ error: 'Subscription not found' }, 404)
  }
  return next()
}
