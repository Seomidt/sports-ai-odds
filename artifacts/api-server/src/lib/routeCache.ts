interface CacheEntry {
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.body as T;
}

export function cacheSet(key: string, body: unknown, ttlMs: number) {
  store.set(key, { body, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key: string) {
  store.delete(key);
}

/**
 * getOrFetch — cache-then-dedup pattern.
 *
 * 1. If a fresh cached value exists → return it instantly (zero DB/AI work).
 * 2. If a concurrent request for the same key is already in flight → await
 *    that same Promise (all 100 waiters get one result, not 100 fetches).
 * 3. Otherwise → run fn(), cache the result, then resolve all waiters.
 *
 * This means 100 simultaneous users hit one DB query / one Claude call.
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn()
    .then((result) => {
      cacheSet(key, result, ttlMs);
      inFlight.delete(key);
      return result;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

// Periodically purge expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60_000);

export const TTL = {
  S15: 15_000,
  S30: 30_000,
  MIN1: 60_000,
  MIN2: 2 * 60_000,
  MIN5: 5 * 60_000,
  MIN10: 10 * 60_000,
  MIN30: 30 * 60_000,
  HOUR2: 2 * 60 * 60_000,
  HOUR6: 6 * 60 * 60_000,
  HOUR24: 24 * 60 * 60_000,
  PERMANENT: 365 * 24 * 60 * 60_000,
};
