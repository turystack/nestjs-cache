import { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { RedisAdapter } from '@/redis/redis.adapter.js'

/**
 * The unit suite asserts that a ttl reaches the adapter. It cannot assert what
 * the number *means*, because a mock has no clock — which is exactly how three
 * libraries came to pass milliseconds into an option documented in seconds and
 * hold their keys 1000x too long.
 *
 * These tests read the expiry back from a real server, so the unit is proven
 * rather than assumed.
 */
const CONNECTION = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380'

let client: Redis
let adapter: RedisAdapter

beforeAll(async () => {
	client = new Redis(CONNECTION, {
		// Fail loud when the container is not up: a suite that quietly passes
		// with no infrastructure is worse than one that is missing.
		maxRetriesPerRequest: 1,
		retryStrategy: () => null,
	})

	await client.ping()

	adapter = new RedisAdapter(client)
})

afterAll(async () => {
	await client?.quit()
})

beforeEach(async () => {
	await client.flushdb()
})

describe('redis adapter · real server', () => {
	describe('set', () => {
		it('reads ttl as seconds, not milliseconds', async () => {
			await adapter.set('unit:set', 'value', {
				ttl: 10,
			})

			// pttl comes back in ms: 10 s must land near 10 000, not near 10.
			const remaining = await client.pttl('unit:set')

			expect(remaining).toBeGreaterThan(9_000)
			expect(remaining).toBeLessThanOrEqual(10_000)
		})

		it('defaults to one hour', async () => {
			await adapter.set('unit:default', 'value')

			const remaining = await client.ttl('unit:default')

			expect(remaining).toBeGreaterThan(3_500)
			expect(remaining).toBeLessThanOrEqual(3_600)
		})

		it('expires the key once the ttl elapses', async () => {
			await adapter.set('unit:expiry', 'value', {
				ttl: 1,
			})

			expect(await adapter.get('unit:expiry')).toBe('value')

			await new Promise((resolve) => setTimeout(resolve, 1_200))

			expect(await adapter.get('unit:expiry')).toBeNull()
		})

		it('honours NX so only the first writer wins', async () => {
			const first = await adapter.set('unit:nx', 'a', {
				mode: 'NX',
				ttl: 10,
			})
			const second = await adapter.set('unit:nx', 'b', {
				mode: 'NX',
				ttl: 10,
			})

			expect(first).toBe(true)
			expect(second).toBe(false)
			expect(await adapter.get('unit:nx')).toBe('a')
		})
	})

	describe('incr', () => {
		it('reads ttl as seconds, not milliseconds', async () => {
			await adapter.incr('unit:incr', {
				ttl: 60,
			})

			const remaining = await client.pttl('unit:incr')

			expect(remaining).toBeGreaterThan(59_000)
			expect(remaining).toBeLessThanOrEqual(60_000)
		})

		it('counts up on the same key', async () => {
			await adapter.incr('unit:count', {
				ttl: 60,
			})
			await adapter.incr('unit:count', {
				ttl: 60,
			})

			expect(await adapter.incr('unit:count')).toBe(3)
		})

		it('leaves the key without an expiry when no ttl is given', async () => {
			await adapter.incr('unit:no-ttl')

			// -1 is redis for "exists, never expires"
			expect(await client.ttl('unit:no-ttl')).toBe(-1)
		})
	})

	describe('incr · expiry window', () => {
		it("pushes the expiry away on every call under 'always'", async () => {
			await adapter.incr('window:always', {
				ttl: 10,
			})
			await new Promise((resolve) => setTimeout(resolve, 1_100))
			await adapter.incr('window:always', {
				ttl: 10,
			})

			// Second call reset the clock: back to the full ttl.
			expect(await client.pttl('window:always')).toBeGreaterThan(9_000)
		})

		it("measures from the first hit under 'on-create'", async () => {
			await adapter.incr('window:fixed', {
				expiry: 'on-create',
				ttl: 10,
			})
			await new Promise((resolve) => setTimeout(resolve, 1_100))
			await adapter.incr('window:fixed', {
				expiry: 'on-create',
				ttl: 10,
			})

			// A second later the window has to be a second shorter, not renewed.
			// This is the whole difference between a limit that eventually lets
			// you back in and one that never does under sustained traffic.
			const remaining = await client.pttl('window:fixed')

			expect(remaining).toBeLessThan(9_100)
			expect(remaining).toBeGreaterThan(8_000)
		})

		it("still counts up under 'on-create'", async () => {
			const options = {
				expiry: 'on-create',
				ttl: 10,
			} as const

			await adapter.incr('window:count', options)
			await adapter.incr('window:count', options)

			expect(await adapter.incr('window:count', options)).toBe(3)
		})

		it("sets the expiry when the key exists without one under 'on-create'", async () => {
			// A counter created by a call that carried no ttl must still get a
			// window from the first call that does, or it would live forever.
			await adapter.incr('window:adopt')
			expect(await client.ttl('window:adopt')).toBe(-1)

			await adapter.incr('window:adopt', {
				expiry: 'on-create',
				ttl: 10,
			})

			expect(await client.pttl('window:adopt')).toBeGreaterThan(9_000)
		})
	})
})
