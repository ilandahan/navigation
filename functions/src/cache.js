'use strict';

// In-memory cache with TTL + inflight coalescing + stale-while-revalidate.
// Module-scope state survives across warm invocations of the same container.

const store = new Map();     // key → { value, expiresAt }
const inflight = new Map();  // key → Promise

async function getOrFetch(key, fetchFn, ttlMs) {
  const now = Date.now();
  const cached = store.get(key);

  // Fresh cache hit
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, fromCache: true, stale: false };
  }

  // Coalesce concurrent requests
  if (inflight.has(key)) {
    const data = await inflight.get(key);
    return { data, fromCache: false, stale: false };
  }

  const promise = fetchFn();
  inflight.set(key, promise);

  try {
    const data = await promise;
    store.set(key, { value: data, expiresAt: now + ttlMs });
    return { data, fromCache: false, stale: false };
  } catch (err) {
    // Stale-while-revalidate: return expired cache if available
    if (cached) {
      return { data: cached.value, fromCache: true, stale: true };
    }
    throw err;
  } finally {
    inflight.delete(key);
  }
}

module.exports = { getOrFetch };
