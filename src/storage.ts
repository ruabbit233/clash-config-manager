import type {
  CurrentPointer,
  HeadersConfig,
  Subscription,
  VersionListItem,
  VersionSnapshot,
} from './types'
import { STORAGE_CONFIG } from './types'

const { VERSION_PREFIX, CURRENT_KEY, HEADERS_KEY } = STORAGE_CONFIG

const scopedKey = (key: string, subscription?: string): string =>
  subscription ? `${STORAGE_CONFIG.SUBSCRIPTION_PREFIX}${subscription}:${key}` : key

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const encodeBase32 = (value: number, length: number): string => {
  let remaining = value
  let encoded = ''

  for (let i = 0; i < length; i += 1) {
    encoded = ULID_ALPHABET[remaining % 32] + encoded
    remaining = Math.floor(remaining / 32)
  }

  return encoded
}

const generateUlid = (): string => {
  const timestampPart = encodeBase32(Date.now(), 10)
  const random = new Uint8Array(10)
  crypto.getRandomValues(random)
  let randomValue = 0n

  for (const byte of random) {
    randomValue = (randomValue << 8n) | BigInt(byte)
  }

  let randomPart = ''
  for (let i = 0; i < 16; i += 1) {
    const index = Number(randomValue & 31n)
    randomPart = ULID_ALPHABET[index] + randomPart
    randomValue >>= 5n
  }

  return `${timestampPart}${randomPart}`
}

const hashContent = async (content: string): Promise<string> => {
  const buffer = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const bytes = new Uint8Array(digest)

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export interface SaveVersionResult {
  snapshot: VersionSnapshot
  unchanged: boolean
}

export interface SaveVersionOptions {
  subscription?: string
  /**
   * Skip creating a new version (and bumping the current pointer) if the
   * incoming content hashes equal the current version's hash. The current
   * snapshot is returned with `unchanged: true`. Default: false.
   *
   * Rollback intentionally leaves this off — restoring an old version is a
   * deliberate audit-relevant act even when the bytes happen to be equal.
   */
  skipIfUnchanged?: boolean
}

export const saveVersion = async (
  kv: KVNamespace,
  content: string,
  message: string,
  options: SaveVersionOptions = {},
): Promise<SaveVersionResult> => {
  const subscription = options.subscription
  const contentHash = await hashContent(content)

  if (options.skipIfUnchanged) {
    const current = await kv.get<CurrentPointer>(scopedKey(CURRENT_KEY, subscription), 'json')
    if (current) {
      const currentSnapshot = await getVersion(kv, current.versionId, subscription)
      if (currentSnapshot && currentSnapshot.contentHash === contentHash) {
        return { snapshot: currentSnapshot, unchanged: true }
      }
    }
  }

  const id = generateUlid()
  const createdAt = new Date().toISOString()

  const snapshot: VersionSnapshot = {
    id,
    content,
    message,
    createdAt,
    contentHash,
  }

  const pointer: CurrentPointer = {
    versionId: id,
    updatedAt: createdAt,
  }

  await kv.put(scopedKey(`${VERSION_PREFIX}${id}`, subscription), JSON.stringify(snapshot))

  try {
    await kv.put(scopedKey(CURRENT_KEY, subscription), JSON.stringify(pointer))
  } catch (error) {
    await kv.delete(scopedKey(`${VERSION_PREFIX}${id}`, subscription))
    throw error
  }

  return { snapshot, unchanged: false }
}

export const getVersion = async (
  kv: KVNamespace,
  versionId: string,
  subscription?: string,
): Promise<VersionSnapshot | null> => {
  const snapshot = await kv.get<VersionSnapshot>(
    scopedKey(`${VERSION_PREFIX}${versionId}`, subscription),
    'json',
  )
  return snapshot ?? null
}

export const listVersions = async (
  kv: KVNamespace,
  limit: number = STORAGE_CONFIG.DEFAULT_PAGE_LIMIT,
  cursor?: string,
  subscription?: string,
): Promise<{ keys: VersionListItem[]; cursor?: string }> => {
  // KV.list() returns keys in lexicographic ASCENDING order with no reverse
  // option, so we cannot rely on its cursor for newest-first pagination.
  // Collect all keys (keys only — cheap), sort globally, then page in memory.
  // The exposed `cursor` is a numeric offset string into the sorted list.
  const allKeyNames: string[] = []
  let kvCursor: string | undefined
  while (true) {
    const page = await kv.list({
      prefix: scopedKey(VERSION_PREFIX, subscription),
      cursor: kvCursor,
    })
    for (const key of page.keys) {
      allKeyNames.push(key.name)
    }
    if (page.list_complete) break
    if (!page.cursor || page.cursor === kvCursor) break
    kvCursor = page.cursor
  }

  // ULID's first 10 chars encode a ms timestamp in Crockford-Base32, so
  // descending lexicographic order matches descending creation time.
  allKeyNames.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  const offset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0
  const pageSlice = allKeyNames.slice(offset, offset + limit)

  const snapshots = await Promise.all(
    pageSlice.map(async (name) => {
      const id = name.slice(scopedKey(VERSION_PREFIX, subscription).length)
      return getVersion(kv, id, subscription)
    }),
  )

  const keys: VersionListItem[] = snapshots
    .filter((item): item is VersionSnapshot => item !== null)
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      message: item.message,
      contentHash: item.contentHash,
    }))

  const nextOffset = offset + pageSlice.length
  const hasMore = nextOffset < allKeyNames.length

  return {
    keys,
    cursor: hasMore ? String(nextOffset) : undefined,
  }
}

export const getCurrent = async (
  kv: KVNamespace,
  subscription?: string,
): Promise<(CurrentPointer & { content: string }) | null> => {
  const pointer = await kv.get<CurrentPointer>(scopedKey(CURRENT_KEY, subscription), 'json')
  if (!pointer) {
    return null
  }

  const version = await getVersion(kv, pointer.versionId, subscription)
  if (!version) {
    return null
  }

  return {
    ...pointer,
    content: version.content,
  }
}

export const getHeaders = async (
  kv: KVNamespace,
  subscription?: string,
): Promise<HeadersConfig> => {
  const headers = await kv.get<HeadersConfig>(scopedKey(HEADERS_KEY, subscription), 'json')
  return headers ?? {}
}

export const setHeaders = async (
  kv: KVNamespace,
  headers: HeadersConfig,
  subscription?: string,
): Promise<void> => {
  await kv.put(scopedKey(HEADERS_KEY, subscription), JSON.stringify(headers))
}

export type DeleteVersionResult = { ok: true } | { ok: false; reason: 'not_found' | 'is_current' }

export const deleteVersion = async (
  kv: KVNamespace,
  versionId: string,
  subscription?: string,
): Promise<DeleteVersionResult> => {
  const key = scopedKey(`${VERSION_PREFIX}${versionId}`, subscription)

  const snapshot = await kv.get<VersionSnapshot>(key, 'json')
  if (!snapshot) {
    return { ok: false, reason: 'not_found' }
  }

  const pointer = await kv.get<CurrentPointer>(scopedKey(CURRENT_KEY, subscription), 'json')
  if (pointer && pointer.versionId === versionId) {
    return { ok: false, reason: 'is_current' }
  }

  await kv.delete(key)
  return { ok: true }
}

export const updateVersionMessage = async (
  kv: KVNamespace,
  versionId: string,
  message: string,
  subscription?: string,
): Promise<VersionSnapshot | null> => {
  const key = scopedKey(`${VERSION_PREFIX}${versionId}`, subscription)
  const snapshot = await kv.get<VersionSnapshot>(key, 'json')
  if (!snapshot) return null

  snapshot.message = message
  await kv.put(key, JSON.stringify(snapshot))
  return snapshot
}

export const isSubscriptionName = (name: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)

export const getSubscription = async (
  kv: KVNamespace,
  name: string,
): Promise<Subscription | null> => {
  if (!isSubscriptionName(name)) return null
  return kv.get<Subscription>(`${STORAGE_CONFIG.SUBSCRIPTION_META_PREFIX}${name}`, 'json')
}

export const listSubscriptions = async (kv: KVNamespace): Promise<Subscription[]> => {
  const subscriptions: Subscription[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list<Subscription>({
      prefix: STORAGE_CONFIG.SUBSCRIPTION_META_PREFIX,
      cursor,
    })
    for (const key of page.keys) {
      if (key.metadata) subscriptions.push(key.metadata)
    }
    if (page.list_complete) break
    cursor = page.cursor
  } while (cursor)
  return subscriptions.sort((a, b) => a.name.localeCompare(b.name))
}

export const createSubscription = async (
  kv: KVNamespace,
  name: string,
): Promise<Subscription | null> => {
  if (!isSubscriptionName(name)) throw new Error('Invalid subscription name')
  if (await getSubscription(kv, name)) return null
  const subscription: Subscription = { name, createdAt: new Date().toISOString() }
  // Publish metadata only after the initial configuration is ready.
  await saveVersion(kv, 'proxies: []\nproxy-groups: []\nrules: []\n', 'Create subscription', {
    subscription: name,
  })
  await kv.put(`${STORAGE_CONFIG.SUBSCRIPTION_META_PREFIX}${name}`, JSON.stringify(subscription), {
    metadata: subscription,
  })
  return subscription
}
