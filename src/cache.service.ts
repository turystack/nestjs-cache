import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import superjson from 'superjson'

import type { CacheOptions, ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER, CACHE_MODULE_OPTIONS } from '@/cache.constants.js'
import type { CacheModuleOptions } from '@/cache.types.js'

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
	private readonly logger = new Logger(CacheService.name)
	private readonly failOpen: boolean

	constructor(
		@Inject(CACHE_ADAPTER)
		private readonly cacheAdapter: ICacheAdapter,
		@Optional()
		@Inject(CACHE_MODULE_OPTIONS)
		options?: CacheModuleOptions,
	) {
		this.failOpen = (options?.onError ?? 'fail-open') === 'fail-open'
	}

	/**
	 * Runs a cache operation, degrading to `fallback` when the storage is
	 * unavailable and the module is configured as `fail-open`.
	 *
	 * Not used by `incr`/`decr`: those back enforcement counters, and a silent
	 * fallback would stop enforcing instead of degrading.
	 */
	private async degradable<T>(
		operation: string,
		fallback: T,
		run: () => Promise<T>,
	): Promise<T> {
		try {
			return await run()
		} catch (error) {
			if (!this.failOpen) {
				throw error
			}

			this.logger.warn({
				error: error instanceof Error ? error.message : String(error),
				message: 'Cache unavailable — serving as a miss',
				operation,
			})

			return fallback
		}
	}

	/** Returns all keys matching `pattern` (glob-style wildcards). */
	async keys(pattern: string) {
		return this.degradable('keys', [] as string[], () =>
			this.cacheAdapter.keys(pattern),
		)
	}

	/**
	 * Gets a value by key, deserialized via superjson.
	 * @returns The parsed value of type `T`, or `null` if the key does not exist.
	 */
	async get<T = string>(key: string) {
		const value = await this.degradable('get', null, () =>
			this.cacheAdapter.get(key),
		)

		if (!value) {
			return null
		}

		return superjson.parse<T>(value)
	}

	/** Checks whether `key` exists in the cache. */
	async exists(key: string) {
		return this.degradable('exists', false, () => this.cacheAdapter.exists(key))
	}

	/**
	 * Serializes `value` via superjson and stores it under `key`.
	 * @returns `true` if the key was written, `false` if skipped (e.g. `NX` mode).
	 */
	async set<T = string>(key: string, value: T, options?: CacheOptions) {
		const payload = superjson.stringify(value)

		return this.degradable('set', false, () =>
			this.cacheAdapter.set(key, payload, options),
		)
	}

	/**
	 * Atomically increments the integer value of `key` by one (no superjson).
	 * Optionally sets a TTL (in **seconds**) on the key.
	 *
	 * Always propagates storage failures, even under `onError: 'fail-open'`:
	 * this counter backs rate limiting, and returning a fallback would stop
	 * enforcing the limit instead of degrading a cache.
	 */
	async incr(
		key: string,
		options?: {
			ttl?: number
		},
	) {
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
		return this.degradable('del', 0, () => this.cacheAdapter.del(keys))
	}
}
