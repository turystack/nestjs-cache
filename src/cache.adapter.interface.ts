/** Options for cache write operations. */
export type CacheOptions = {
  /** When `'NX'`, only sets if key does **not** exist. When `'XX'`, only sets if key **already** exists. */
  mode?: 'NX' | 'XX'
  /** Time-to-live in **seconds**. Defaults to `3600` (1 hour). */
  ttl?: number
}

/**
 * Low-level cache adapter contract.
 *
 * Implement this interface to add a new cache provider.
 * The built-in implementation is {@link RedisAdapter}.
 */
export interface ICacheAdapter {
  /** Returns all keys matching `pattern` (supports glob-style wildcards). */
  keys(pattern: string): Promise<string[]>

  /** Gets the raw string value for `key`, or `null` if missing. */
  get(key: string): Promise<string | null>

  /** Checks whether `key` exists. */
  exists(key: string): Promise<boolean>

  /**
   * Sets `key` to `value` with the given options.
   * @returns `true` if the key was written, `false` if skipped (e.g. `NX` mode and key existed).
   */
  set(key: string, value: string, options?: CacheOptions): Promise<boolean>

  /**
   * Atomically increments the integer value of `key` by one.
   * If the key does not exist it is initialised to `0` before incrementing.
   * Optionally sets a TTL (in **seconds**) on the key.
   */
  incr(key: string, options?: { ttl?: number }): Promise<number>

  /** Atomically decrements the integer value of `key` by one. */
  decr(key: string): Promise<number>

  /**
   * Deletes keys matching the given patterns (glob-style).
   * @returns The number of keys deleted.
   */
  del(patterns: string[]): Promise<number>
}
