import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from './index'
import { generateToken } from './auth'
import type { Env, Subscription, VersionListItem } from './types'

const createKv = (): KVNamespace => {
  const values = new Map<string, { value: string; metadata?: unknown }>()
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const entry = values.get(key)
      return entry ? (type === 'json' ? JSON.parse(entry.value) : entry.value) : null
    }),
    put: vi.fn(async (key: string, value: string, options?: { metadata?: unknown }) => {
      values.set(key, { value, metadata: options?.metadata })
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key)
    }),
    list: vi.fn(async (options: { prefix: string; cursor?: string }) => {
      // Small pages exercise cursor traversal for both subscriptions and versions.
      const names = [...values.keys()].filter((key) => key.startsWith(options.prefix)).sort()
      const start = Number(options.cursor || 0)
      const keys = names.slice(start, start + 2).map((name) => ({
        name,
        metadata: values.get(name)?.metadata,
      }))
      const list_complete = start + 2 >= names.length
      return { keys, list_complete, cursor: list_complete ? undefined : String(start + 2) }
    }),
  } as unknown as KVNamespace
}

describe('named subscriptions', () => {
  let env: Env
  let token: string

  beforeEach(async () => {
    env = {
      KV: createKv(),
      ASSETS: { fetch: vi.fn(async () => new Response('SPA')) } as unknown as Fetcher,
      ADMIN_PASSWORD: 'test-password',
      TOKEN_SECRET: 'subscription-test-secret-at-least-32-characters',
    }
    token = await generateToken(env.TOKEN_SECRET)
  })

  const request = (path: string, method = 'GET', body?: unknown, authenticated = true) =>
    app.request(
      path,
      {
        method,
        headers: {
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    )

  const create = async (name: string) => {
    const res = await request('/api/subscriptions', 'POST', { name })
    expect(res.status).toBe(201)
    return res.json<Subscription>()
  }

  const save = async (name: string, content: string) => {
    const base = name ? `/api/subscriptions/${name}` : '/api'
    const res = await request(`${base}/config`, 'PUT', { content })
    expect(res.status).toBe(200)
    return res.json<{ versionId: string; unchanged: boolean }>()
  }

  it('creates and lists subscriptions across KV pages, without duplicating or overwriting names', async () => {
    expect(await (await request('/api/subscriptions')).json()).toEqual([])
    await create('abcdefgh')
    await create('second')
    await create('third')
    await save('abcdefgh', 'name: preserved')
    expect((await request('/api/subscriptions', 'POST', { name: 'abcdefgh' })).status).toBe(409)
    const subscriptions = await (await request('/api/subscriptions')).json<Subscription[]>()
    expect(subscriptions.map((item) => item.name)).toEqual(['abcdefgh', 'second', 'third'])
    expect(await (await request('/bus/abcdefgh', 'GET', undefined, false)).text()).toBe(
      'name: preserved',
    )
    expect(await (await request('/bus/abcdefgh/', 'GET', undefined, false)).text()).toBe(
      'name: preserved',
    )
  })

  it.each([
    '',
    '../x',
    'x/y',
    'x:y',
    'a b',
    '<script>',
    '_name',
    '订阅',
    'a'.repeat(65),
    null,
    123,
  ])('rejects invalid subscription name %j', async (name) => {
    expect((await request('/api/subscriptions', 'POST', { name })).status).toBe(400)
    expect(env.KV.put).not.toHaveBeenCalled()
  })

  it('requires admin authentication for listing, creating, and all scoped APIs', async () => {
    await create('abcdefgh')
    const routes = [
      ['/api/subscriptions', 'GET'],
      ['/api/subscriptions', 'POST'],
      ['/api/subscriptions/abcdefgh/config', 'GET'],
      ['/api/subscriptions/abcdefgh/config', 'PUT'],
      ['/api/subscriptions/abcdefgh/versions', 'GET'],
      ['/api/subscriptions/abcdefgh/versions/id', 'GET'],
      ['/api/subscriptions/abcdefgh/versions/id', 'PATCH'],
      ['/api/subscriptions/abcdefgh/versions/id', 'DELETE'],
      ['/api/subscriptions/abcdefgh/versions/id/rollback', 'POST'],
      ['/api/subscriptions/abcdefgh/headers', 'GET'],
      ['/api/subscriptions/abcdefgh/headers', 'PUT'],
    ]
    for (const [path, method] of routes) {
      expect((await request(path, method, undefined, false)).status).toBe(401)
    }
  })

  it('serves independent YAML, download filenames, headers and ETags while preserving legacy paths', async () => {
    await create('abcdefgh')
    await create('abcdefgh2')
    await save('', 'name: default')
    const first = await save('abcdefgh', 'name: first')
    await save('abcdefgh2', 'name: second')
    expect((await save('abcdefgh', 'name: first')).unchanged).toBe(true)
    await request('/api/headers', 'PUT', { 'X-Config': 'default' })
    await request('/api/subscriptions/abcdefgh/headers', 'PUT', { 'X-Config': 'first' })
    await request('/api/subscriptions/abcdefgh2/headers', 'PUT', { 'X-Config': 'second' })

    for (const [path, content, header] of [
      ['/download', 'name: default', 'default'],
      ['/bus/abcdefgh', 'name: first', 'first'],
      ['/bus/abcdefgh/download', 'name: first', 'first'],
      ['/bus/abcdefgh2', 'name: second', 'second'],
    ]) {
      const res = await request(path, 'GET', undefined, false)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/yaml')
      expect(res.headers.get('X-Config')).toBe(header)
      expect(await res.text()).toBe(content)
    }
    const download = await request('/bus/abcdefgh/download', 'GET', undefined, false)
    expect(download.headers.get('Content-Disposition')).toBe('attachment; filename="abcdefgh.yaml"')
    const headers = { 'If-None-Match': `"${first.versionId}"` }
    expect((await app.request('/bus/abcdefgh', { headers }, env)).status).toBe(304)
    expect((await app.request('/bus/abcdefgh2', { headers }, env)).status).toBe(200)
    expect((await app.request('/bus/abcdefgh/download', { headers }, env)).status).toBe(200)
    expect((await request('/', 'GET', undefined, false)).status).toBe(404)
    const legacy = await app.request('/', { headers: { 'User-Agent': 'clash' } }, env)
    expect(await legacy.text()).toBe('name: default')
    expect(await (await request('/api/headers')).json()).toEqual({ 'X-Config': 'default' })
  })

  it('isolates history, pagination, rollback, message edits and deletion from every other subscription', async () => {
    await create('one')
    await create('two')
    await save('', 'name: default')
    const original = await save('one', 'name: original')
    const latest = await save('one', 'name: latest')
    await save('two', 'name: other')
    const firstPage = await (
      await request('/api/subscriptions/one/versions?limit=2')
    ).json<{ keys: VersionListItem[]; cursor: string }>()
    const secondPage = await (
      await request(`/api/subscriptions/one/versions?limit=2&cursor=${firstPage.cursor}`)
    ).json<{ keys: VersionListItem[] }>()
    const ids = [...firstPage.keys, ...secondPage.keys].map((item) => item.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain(original.versionId)
    expect(ids).toContain(latest.versionId)
    const defaultList = await (await request('/api/versions')).json<{ keys: VersionListItem[] }>()
    expect(defaultList.keys).toHaveLength(1)

    for (const base of ['/api', '/api/subscriptions/two']) {
      for (const [suffix, method, body] of [
        ['', 'GET', undefined],
        ['', 'PATCH', { message: 'unauthorized scope' }],
        ['', 'DELETE', undefined],
        ['/rollback', 'POST', undefined],
      ] as const) {
        expect(
          (await request(`${base}/versions/${original.versionId}${suffix}`, method, body)).status,
        ).toBe(404)
      }
    }
    const path = `/api/subscriptions/one/versions/${original.versionId}`
    expect((await request(path, 'PATCH', { message: 'updated' })).status).toBe(200)
    expect(await (await request(path)).json()).toMatchObject({
      message: 'updated',
      content: 'name: original',
    })
    expect(
      (await request(`/api/subscriptions/one/versions/${latest.versionId}`, 'DELETE')).status,
    ).toBe(409)
    const rollback = await request(`${path}/rollback`, 'POST')
    expect(rollback.status).toBe(200)
    expect((await rollback.json<{ versionId: string }>()).versionId).not.toBe(original.versionId)
    expect(await (await request('/bus/one', 'GET', undefined, false)).text()).toBe('name: original')
    expect(await (await request('/bus/two', 'GET', undefined, false)).text()).toBe('name: other')
    expect((await request(path, 'DELETE')).status).toBe(204)
    expect((await request(path)).status).toBe(404)
  })

  it('returns 404 for unknown subscriptions without falling back to the default config or SPA', async () => {
    await save('', 'name: default')
    for (const path of [
      '/bus/missing',
      '/bus/missing/download',
      '/api/subscriptions/missing/config',
      '/api/subscriptions/missing/versions',
      '/api/subscriptions/missing/headers',
    ]) {
      expect((await request(path)).status).toBe(404)
    }
    expect(
      (await request('/api/subscriptions/missing/config', 'PUT', { content: 'name: wrong' }))
        .status,
    ).toBe(404)
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
  })

  it('validates YAML before updating a named config', async () => {
    await create('abcdefgh')
    await save('abcdefgh', 'name: valid')
    expect(
      (await request('/api/subscriptions/abcdefgh/config', 'PUT', { content: 'invalid: [yaml' }))
        .status,
    ).toBe(400)
    expect(await (await request('/bus/abcdefgh', 'GET', undefined, false)).text()).toBe(
      'name: valid',
    )
  })
})
