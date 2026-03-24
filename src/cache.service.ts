import { Inject, Injectable } from '@nestjs/common'
import superjson from 'superjson'

import type { CacheOptions, ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER } from '@/cache.constants.js'

/**
 * High-level cache service with automatic superjson serialization.
 *
 * Inject this service to read/write typed values to the cache.
 *
 * @example
 * ```ts
 * import { CacheService } from '@turystack/nestjs-cache'
 *
 * @Injectable()
 * class UsersService {
 *   constructor(private readonly cache: CacheService) {}
 *
 *   async getUser(id: string) {
 *     return this.cache.get<User>(`user:${id}`)
 *   }
 * }
 * ```
 */
@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_ADAPTER)
    private readonly cacheAdapter: ICacheAdapter,
  ) {}

  /** Returns all keys matching `pattern` (glob-style wildcards). */
  async keys(pattern: string) {
    return this.cacheAdapter.keys(pattern)
  }

  /**
   * Gets a value by key, deserialized via superjson.
   * @returns The parsed value of type `T`, or `null` if the key does not exist.
   */
  async get<T = string>(key: string) {
    const value = await this.cacheAdapter.get(key)

    if (!value) {
      return null
    }

    return superjson.parse<T>(value)
  }

  /** Checks whether `key` exists in the cache. */
  async exists(key: string) {
    return this.cacheAdapter.exists(key)
  }

  /**
   * Serializes `value` via superjson and stores it under `key`.
   * @returns `true` if the key was written, `false` if skipped (e.g. `NX` mode).
   */
  async set<T = string>(key: string, value: T, options?: CacheOptions) {
    const payload = superjson.stringify(value)

    return this.cacheAdapter.set(key, payload, options)
  }

  /**
   * Atomically increments the integer value of `key` by one (no superjson).
   * Optionally sets a TTL (in **seconds**) on the key.
   */
  async incr(key: string, options?: { ttl?: number }) {
    return this.cacheAdapter.incr(key, options)
  }

  /** Atomically decrements the integer value of `key` by one (no superjson). */
  async decr(key: string) {
    return this.cacheAdapter.decr(key)
  }

  /**
   * Deletes keys matching the given patterns (glob-style).
   * @returns The number of keys deleted.
   */
  async del(keys: string[]) {
    return this.cacheAdapter.del(keys)
  }
}
