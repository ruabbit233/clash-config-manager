import { Hono } from 'hono'
import type { Env } from './types'
import { authGuard } from './middleware/auth'
import { publicRoutes } from './routes/public'
import { authRoutes } from './routes/auth'
import { configRoutes } from './routes/config'
import { versionRoutes } from './routes/versions'
import { headerRoutes } from './routes/headers'

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: 'Internal server error' }, 500)
})

app.get('/health', (c) => c.json({ ok: true }))

app.route('/', publicRoutes)

// authGuard skips /api/auth/login and /api/auth/verify internally
app.use('/api/*', authGuard)

app.route('/api/auth', authRoutes)
app.route('/api/config', configRoutes)
app.route('/api/versions', versionRoutes)
app.route('/api/headers', headerRoutes)

app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
