interface CacheEntry {
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

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
