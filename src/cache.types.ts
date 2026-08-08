/**
 * Options for {@link CacheModule.register}.
 *
 * The module is storage-agnostic: each adapter brings its own connection
 * config. Redis is the built-in adapter option today.
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
	/** Storage adapter to use. Redis is the built-in option. */
	adapter: 'redis'
	/**
	 * Behaviour when the storage is unavailable. Defaults to `'fail-open'`.
	 *
	 * - `'fail-open'` — `keys`, `get`, `exists`, `set` and `del` degrade to a
	 *   cache miss instead of throwing, so a storage outage does not take the
	 *   application down with it.
	 * - `'fail-closed'` — every failure propagates.
	 *
	 * `incr` and `decr` **always** propagate, on both settings. They back
	 * enforcement counters (`@turystack/nestjs-rate-limit`), and degrading them
	 * would silently stop enforcing a limit rather than degrade a cache.
	 */
	onError?: 'fail-closed' | 'fail-open'
	/** Redis connection config (used by the `'redis'` adapter). */
	redis: {
		/** Connection URL (e.g. `redis://localhost:6379`). */
		url: string
	}
}
