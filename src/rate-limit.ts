interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_SECONDS = 60;

export const checkRateLimit = (
  ip: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
): { allowed: boolean; remaining: number; resetAt: number } => {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowSeconds * 1000;
    store.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: maxAttempts - 1, resetAt };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
};

export const cleanupRateLimitStore = (): void => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(ip);
    }
  }
};

setInterval(cleanupRateLimitStore, 60_000);
