import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveVersion,
  getVersion,
  listVersions,
  getCurrent,
  getHeaders,
  setHeaders,
} from './storage'

function createMockKv(): {
  kv: KVNamespace
  store: Map<string, string>
} {
  const store = new Map<string, string>()
  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const val = store.get(key)
      if (val === undefined) return null
      if (type === 'json') return JSON.parse(val)
      return val
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(options?.prefix ?? ''))
        .map((name) => ({ name }))
      const limit = options?.limit ?? 20
      const cursor = options?.cursor
      const start = cursor ? Number.parseInt(cursor, 10) : 0
      const sliced = keys.slice(start, start + limit)
      const listComplete = start + limit >= keys.length
      return {
        keys: sliced,
        list_complete: listComplete,
        cursor: listComplete ? undefined : String(start + limit),
      }
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  } as unknown as KVNamespace
  return { kv, store }
}

describe('storage', () => {
  let { kv, store } = createMockKv()

  beforeEach(() => {
    ;({ kv, store } = createMockKv())
  })

  describe('saveVersion', () => {
    it('should save a version and update current pointer', async () => {
      const snapshot = await saveVersion(kv, 'test: content', 'test message')
      expect(snapshot.id).toBeTruthy()
      expect(snapshot.content).toBe('test: content')
      expect(snapshot.message).toBe('test message')
      expect(snapshot.createdAt).toBeTruthy()
      expect(snapshot.contentHash).toBeTruthy()

      expect(store.has(`version:${snapshot.id}`)).toBe(true)
      expect(store.has('config:current')).toBe(true)
    })

    it('should produce consistent content hashes', async () => {
      const snap1 = await saveVersion(kv, 'same content', 'first')
      const kv2 = createMockKv().kv
      const snap2 = await saveVersion(kv2, 'same content', 'second')
      expect(snap1.contentHash).toBe(snap2.contentHash)
    })

    it('should produce different hashes for different content', async () => {
      const snap1 = await saveVersion(kv, 'content A', 'first')
      const snap2 = await saveVersion(kv, 'content B', 'second')
      expect(snap1.contentHash).not.toBe(snap2.contentHash)
    })
  })

  describe('getVersion', () => {
    it('should return null for non-existent version', async () => {
      const result = await getVersion(kv, 'nonexistent')
      expect(result).toBeNull()
    })

    it('should return saved version', async () => {
      const snapshot = await saveVersion(kv, 'test content', 'msg')
      const result = await getVersion(kv, snapshot.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(snapshot.id)
      expect(result!.content).toBe('test content')
    })
  })

  describe('getCurrent', () => {
    it('should return null when no config exists', async () => {
      const result = await getCurrent(kv)
      expect(result).toBeNull()
    })

    it('should return current config with content', async () => {
      await saveVersion(kv, 'yaml content', 'initial')
      const result = await getCurrent(kv)
      expect(result).not.toBeNull()
      expect(result!.content).toBe('yaml content')
    })

    it('should return latest saved version', async () => {
      await saveVersion(kv, 'first', 'v1')
      await saveVersion(kv, 'second', 'v2')
      const result = await getCurrent(kv)
      expect(result!.content).toBe('second')
    })
  })

  describe('listVersions', () => {
    it('should return empty list when no versions', async () => {
      const result = await listVersions(kv)
      expect(result.keys).toHaveLength(0)
    })

    it('should list saved versions sorted by id descending', async () => {
      const v1 = await saveVersion(kv, 'first', 'v1')
      const v2 = await saveVersion(kv, 'second', 'v2')
      const v3 = await saveVersion(kv, 'third', 'v3')
      const result = await listVersions(kv)
      expect(result.keys).toHaveLength(3)

      const expectedDescIds = [v1.id, v2.id, v3.id].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      expect(result.keys.map((k) => k.id)).toEqual(expectedDescIds)
    })

    it('should return globally newest-first across paginated calls', async () => {
      const saved = []
      for (let i = 0; i < 25; i += 1) {
        saved.push(await saveVersion(kv, `content-${i}`, `v${i}`))
      }

      const expectedDescIds = saved.map((s) => s.id).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

      const page1 = await listVersions(kv, 10)
      expect(page1.keys).toHaveLength(10)
      expect(page1.keys.map((k) => k.id)).toEqual(expectedDescIds.slice(0, 10))
      expect(page1.cursor).toBeDefined()

      const page2 = await listVersions(kv, 10, page1.cursor)
      expect(page2.keys).toHaveLength(10)
      expect(page2.keys.map((k) => k.id)).toEqual(expectedDescIds.slice(10, 20))
      expect(page2.cursor).toBeDefined()

      const page3 = await listVersions(kv, 10, page2.cursor)
      expect(page3.keys).toHaveLength(5)
      expect(page3.keys.map((k) => k.id)).toEqual(expectedDescIds.slice(20, 25))
      expect(page3.cursor).toBeUndefined()
    })

    it('should not duplicate or skip items across pages', async () => {
      for (let i = 0; i < 15; i += 1) {
        await saveVersion(kv, `content-${i}`, `v${i}`)
      }

      const collected: string[] = []
      let cursor: string | undefined
      do {
        const res = await listVersions(kv, 4, cursor)
        for (const item of res.keys) collected.push(item.id)
        cursor = res.cursor
      } while (cursor)

      expect(collected).toHaveLength(15)
      expect(new Set(collected).size).toBe(15)
      const sortedDesc = [...collected].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      expect(collected).toEqual(sortedDesc)
    })
  })

  describe('headers', () => {
    it('should return empty object when no headers set', async () => {
      const result = await getHeaders(kv)
      expect(result).toEqual({})
    })

    it('should save and retrieve headers', async () => {
      await setHeaders(kv, { 'Cache-Control': 'no-cache', 'X-Custom': 'value' })
      const result = await getHeaders(kv)
      expect(result).toEqual({ 'Cache-Control': 'no-cache', 'X-Custom': 'value' })
    })

    it('should overwrite previous headers', async () => {
      await setHeaders(kv, { 'X-Old': 'old' })
      await setHeaders(kv, { 'X-New': 'new' })
      const result = await getHeaders(kv)
      expect(result).toEqual({ 'X-New': 'new' })
    })
  })
})
