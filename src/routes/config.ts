import { Hono } from 'hono'
import { parseDocument } from 'yaml'
import { safeParseJson } from '../utils/response'
import { getCurrent, saveVersion } from '../storage'
import type { Env } from '../types'

export const configRoutes = new Hono<{ Bindings: Env }>()

configRoutes.get('/', async (c) => {
  const current = await getCurrent(c.env.KV)
  if (!current) {
    return c.json({ error: 'No config found' }, 404)
  }

  return c.json({
    content: current.content,
    versionId: current.versionId,
    updatedAt: current.updatedAt,
  })
})

configRoutes.put('/', async (c) => {
  const body = await safeParseJson<{ content?: string; message?: string }>(c)

  if (!body || typeof body.content !== 'string') {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const doc = parseDocument(body.content)
  if (doc.errors.length > 0) {
    return c.json(
      {
        success: false,
        error: 'Invalid YAML',
        details: doc.errors.map((item) => item.message),
      },
      400,
    )
  }

  const snapshot = await saveVersion(
    c.env.KV,
    body.content,
    typeof body.message === 'string' && body.message.length > 0 ? body.message : 'Update config',
  )

  return c.json({
    versionId: snapshot.id,
    contentHash: snapshot.contentHash,
    createdAt: snapshot.createdAt,
  })
})
