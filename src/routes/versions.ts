import { Hono } from 'hono'
import { safeParseJson } from '../utils/response'
import {
  deleteVersion,
  getVersion,
  listVersions,
  saveVersion,
  updateVersionMessage,
} from '../storage'
import { STORAGE_CONFIG } from '../types'
import type { Env } from '../types'

export const versionRoutes = new Hono<{ Bindings: Env }>()

versionRoutes.get('/', async (c) => {
  const limitParam = c.req.query('limit')
  const cursor = c.req.query('cursor')
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN
  const limit = Number.isNaN(parsed)
    ? STORAGE_CONFIG.DEFAULT_PAGE_LIMIT
    : Math.min(Math.max(parsed, 1), STORAGE_CONFIG.MAX_PAGE_LIMIT)

  const versions = await listVersions(c.env.KV, limit, cursor)
  return c.json(versions)
})

versionRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const version = await getVersion(c.env.KV, id)
  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }

  return c.json(version)
})

versionRoutes.post('/:id/rollback', async (c) => {
  const id = c.req.param('id')
  const version = await getVersion(c.env.KV, id)
  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }

  const rollback = await saveVersion(
    c.env.KV,
    version.content,
    `Rollback to version ${id.slice(0, 8)}`,
  )

  return c.json({
    versionId: rollback.id,
    contentHash: rollback.contentHash,
    createdAt: rollback.createdAt,
  })
})

versionRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await safeParseJson<{ message?: string }>(c)
  if (!body || typeof body.message !== 'string' || body.message.length === 0) {
    return c.json({ error: 'Invalid request body: message is required' }, 400)
  }

  const updated = await updateVersionMessage(c.env.KV, id, body.message)
  if (!updated) {
    return c.json({ error: 'Version not found' }, 404)
  }

  return c.json({
    id: updated.id,
    message: updated.message,
    createdAt: updated.createdAt,
    contentHash: updated.contentHash,
  })
})

versionRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const result = await deleteVersion(c.env.KV, id)
  if (result.ok) {
    return c.body(null, 204)
  }
  if (result.reason === 'not_found') {
    return c.json({ error: 'Version not found' }, 404)
  }
  return c.json({ error: 'Cannot delete the current version' }, 409)
})
