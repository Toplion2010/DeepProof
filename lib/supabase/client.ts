import { createBrowserClient } from '@supabase/ssr'

/**
 * In-process lock that replaces navigator.locks to avoid React Strict Mode
 * double-mount conflicts where two mounts compete for the same Web Lock.
 * Safe for single-tab apps; cross-tab sync is not needed here.
 */
async function inProcessLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return await fn()
}

// Own singleton — @supabase/ssr's cachedBrowserClient ignores option changes
// across HMR reloads, so we manage the cache ourselves with isSingleton: false.
let cached: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (cached) return cached
  cached = createBrowserClient(url, key, {
    isSingleton: false,
    auth: { lock: inProcessLock },
  })
  return cached
}
