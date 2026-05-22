/**
 * Constant-time string equality. Hashes both sides with SHA-256 first so input
 * length never leaks, then XOR-sums the 32-byte buffers without short-circuit.
 *
 * Use for any secret comparison (password, token). Never use `===`.
 */
const encoder = new TextEncoder()

const sha256 = async (input: string): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return new Uint8Array(digest)
}

export const timingSafeEqual = async (a: string, b: string): Promise<boolean> => {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)])
  if (ha.byteLength !== hb.byteLength) return false
  let diff = 0
  for (let i = 0; i < ha.byteLength; i += 1) {
    diff |= ha[i] ^ hb[i]
  }
  return diff === 0
}

/**
 * Per-IP fixed-window login rate limit backed by KV. Eventually consistent —
 * best-effort only. The window self-cleans via KV `expirationTtl`.
 *
 * Counter is incremented only on *failed* attempts, so legitimate users who
 * eventually succeed don't burn through budget.
 */
export const RATE_LIMIT = {
  WINDOW_SECONDS: 15 * 60,
  MAX_ATTEMPTS: 10,
  KEY_PREFIX: 'ratelimit:login:',
} as const

interface RateLimitState {
  count: number
  windowStart: number
}

export interface RateLimitCheck {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

const rateLimitKey = (identifier: string): string => `${RATE_LIMIT.KEY_PREFIX}${identifier}`

export const checkRateLimit = async (
  kv: KVNamespace,
  identifier: string,
): Promise<RateLimitCheck> => {
  const now = Math.floor(Date.now() / 1000)
  const state = await kv.get<RateLimitState>(rateLimitKey(identifier), 'json')

  if (!state || now - state.windowStart >= RATE_LIMIT.WINDOW_SECONDS) {
    return { allowed: true, retryAfterSeconds: 0, remaining: RATE_LIMIT.MAX_ATTEMPTS }
  }

  const remaining = Math.max(0, RATE_LIMIT.MAX_ATTEMPTS - state.count)
  if (remaining > 0) {
    return { allowed: true, retryAfterSeconds: 0, remaining }
  }

  const retryAfterSeconds = Math.max(1, RATE_LIMIT.WINDOW_SECONDS - (now - state.windowStart))
  return { allowed: false, retryAfterSeconds, remaining: 0 }
}

export const recordFailedAttempt = async (kv: KVNamespace, identifier: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000)
  const key = rateLimitKey(identifier)
  const existing = await kv.get<RateLimitState>(key, 'json')

  const next: RateLimitState =
    existing && now - existing.windowStart < RATE_LIMIT.WINDOW_SECONDS
      ? { count: existing.count + 1, windowStart: existing.windowStart }
      : { count: 1, windowStart: now }

  await kv.put(key, JSON.stringify(next), { expirationTtl: RATE_LIMIT.WINDOW_SECONDS })
}

export const getClientIdentifier = (headers: Headers): string => {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}
