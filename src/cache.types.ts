/**
 * Options for {@link CacheModule.register}.
 *
 * @example
 * ```ts
 * CacheModule.register({
 *   adapter: 'redis',
 *   redis: { url: process.env.REDIS_URL },
 * })
 * ```
 */
export type CacheModuleOptions = {
  /** Cache adapter to use. */
  adapter: 'redis'
  /** Redis connection config. */
  redis: {
    /** Connection URL (e.g. `redis://localhost:6379`). */
    url: string
  }
}
