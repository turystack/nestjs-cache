import { Inject, Injectable } from '@nestjs/common'
import type { Redis } from 'ioredis'

import type { CacheOptions, ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER_REDIS } from '@/cache.constants.js'

/**
 * Increments, and sets the expiry only on the call that created the key.
 *
 * `PTTL` answers -1 for a key with no expiry and -2 for one that does not
 * exist; either means this call owns the start of the window.
 */
const INCR_EXPIRE_ON_CREATE = `
	local value = redis.call('INCR', KEYS[1])
	if redis.call('PTTL', KEYS[1]) < 0 then
		redis.call('PEXPIRE', KEYS[1], ARGV[1])
	end
	return value
`

@Injectable()
export class RedisAdapter implements ICacheAdapter {
	constructor(
		@Inject(CACHE_ADAPTER_REDIS)
		private readonly client: Redis,
	) {}

	async keys(pattern: string): Promise<string[]> {
		const keys: string[] = []
		let cursor = '0'

		do {
			const [nextCursor, result] = await this.client.scan(
				cursor,
				'MATCH',
				pattern,
				'COUNT',
				100,
			)

			cursor = nextCursor
			keys.push(...result)
		} while (cursor !== '0')

		return keys
	}

	async get(key: string) {
		return await this.client.get(key)
	}

	async exists(key: string) {
		const exists = await this.client.exists(key)

		return exists > 0
	}

	async set(key: string, value: string, options?: CacheOptions) {
		const ttlMs = (options?.ttl ?? 3600) * 1000

		let result: string | null

		if (options?.mode === 'NX') {
			result = await this.client.set(key, value, 'PX', ttlMs, 'NX')
		} else if (options?.mode === 'XX') {
			result = await this.client.set(key, value, 'PX', ttlMs, 'XX')
		} else {
			result = await this.client.set(key, value, 'PX', ttlMs)
		}

		return result === 'OK'
	}

	async incr(
		key: string,
		options?: {
			ttl?: number
			expiry?: 'always' | 'on-create'
		},
	) {
		if (!options?.ttl) {
			return this.client.incr(key)
		}

		const ttlMs = options.ttl * 1000

		if (options.expiry !== 'on-create') {
			const value = await this.client.incr(key)
			await this.client.pexpire(key, ttlMs)
			return value
		}

		// Increment and expiry have to land together. Splitting them leaves a
		// window where a crash between the two commands produces a counter with
		// no expiry — for a rate limiter, a key that throttles forever.
		const value = await this.client.eval(
			INCR_EXPIRE_ON_CREATE,
			1,
			key,
			String(ttlMs),
		)

		return Number(value)
	}

	async decr(key: string) {
		return this.client.decr(key)
	}

	async del(patterns: string[]) {
		let deletedCount = 0

		for (const pattern of patterns) {
			if (pattern.includes('*')) {
				const keys = await this.keys(pattern)
				if (keys.length > 0) {
					deletedCount += await this.client.del(...keys)
				}
			} else {
				deletedCount += await this.client.del(pattern)
			}
		}

		return deletedCount
	}
}
