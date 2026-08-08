import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER, CACHE_MODULE_OPTIONS } from '@/cache.constants.js'
import { CacheService } from '@/cache.service.js'
import type { CacheModuleOptions } from '@/cache.types.js'

const OUTAGE = new Error('Redis unavailable')

async function createService(onError?: CacheModuleOptions['onError']): Promise<{
	adapter: ICacheAdapter
	service: CacheService
}> {
	const moduleRef = await Test.createTestingModule({
		providers: [
			CacheService,
			{
				provide: CACHE_ADAPTER,
				useValue: {
					decr: vi.fn(),
					del: vi.fn(),
					exists: vi.fn(),
					get: vi.fn(),
					incr: vi.fn(),
					keys: vi.fn(),
					set: vi.fn(),
				},
			},
			{
				provide: CACHE_MODULE_OPTIONS,
				useValue: {
					adapter: 'redis',
					onError,
					redis: {
						url: 'redis://localhost:6379',
					},
				} satisfies CacheModuleOptions,
			},
		],
	}).compile()

	return {
		adapter: moduleRef.get<ICacheAdapter>(CACHE_ADAPTER),
		service: moduleRef.get<CacheService>(CacheService),
	}
}

describe('CacheService · storage outage', () => {
	describe('fail-open (default)', () => {
		let adapter: ICacheAdapter
		let service: CacheService

		beforeEach(async () => {
			;({ adapter, service } = await createService())
		})

		it('serves get as a miss instead of throwing', async () => {
			vi.mocked(adapter.get).mockRejectedValue(OUTAGE)

			await expect(service.get('user:1')).resolves.toBeNull()
		})

		it('serves exists as false', async () => {
			vi.mocked(adapter.exists).mockRejectedValue(OUTAGE)

			await expect(service.exists('user:1')).resolves.toBe(false)
		})

		it('serves keys as an empty list', async () => {
			vi.mocked(adapter.keys).mockRejectedValue(OUTAGE)

			await expect(service.keys('user:*')).resolves.toEqual([])
		})

		it('reports del as zero keys removed', async () => {
			vi.mocked(adapter.del).mockRejectedValue(OUTAGE)

			await expect(
				service.del([
					'user:1',
				]),
			).resolves.toBe(0)
		})

		/**
		 * `@turystack/nestjs-lock` treats the return of `set(key, value, { mode: 'NX' })`
		 * as "lock acquired". Degrading to `false` keeps mutual exclusion safe: an
		 * outage denies the lock instead of handing it to every instance at once.
		 */
		it('reports set as not written, so an NX lock is denied and never granted', async () => {
			vi.mocked(adapter.set).mockRejectedValue(OUTAGE)

			await expect(
				service.set('lock:order', 'token', {
					mode: 'NX',
				}),
			).resolves.toBe(false)
		})

		/**
		 * `@turystack/nestjs-rate-limit` counts with `incr`. A fallback here would
		 * stop enforcing the limit rather than degrade a cache, so it must throw
		 * even under fail-open.
		 */
		it('still throws on incr, so rate limiting never silently stops enforcing', async () => {
			vi.mocked(adapter.incr).mockRejectedValue(OUTAGE)

			await expect(service.incr('rate:ip:1.2.3.4')).rejects.toThrow(
				'Redis unavailable',
			)
		})

		it('still throws on decr', async () => {
			vi.mocked(adapter.decr).mockRejectedValue(OUTAGE)

			await expect(service.decr('rate:ip:1.2.3.4')).rejects.toThrow(
				'Redis unavailable',
			)
		})
	})

	describe('fail-closed', () => {
		let adapter: ICacheAdapter
		let service: CacheService

		beforeEach(async () => {
			;({ adapter, service } = await createService('fail-closed'))
		})

		it('propagates on get', async () => {
			vi.mocked(adapter.get).mockRejectedValue(OUTAGE)

			await expect(service.get('user:1')).rejects.toThrow('Redis unavailable')
		})

		it('propagates on set', async () => {
			vi.mocked(adapter.set).mockRejectedValue(OUTAGE)

			await expect(service.set('user:1', 'value')).rejects.toThrow(
				'Redis unavailable',
			)
		})
	})

	describe('without module options', () => {
		it('defaults to fail-open', async () => {
			const moduleRef = await Test.createTestingModule({
				providers: [
					CacheService,
					{
						provide: CACHE_ADAPTER,
						useValue: {
							decr: vi.fn(),
							del: vi.fn(),
							exists: vi.fn(),
							get: vi.fn().mockRejectedValue(OUTAGE),
							incr: vi.fn(),
							keys: vi.fn(),
							set: vi.fn(),
						},
					},
				],
			}).compile()

			const service = moduleRef.get<CacheService>(CacheService)

			await expect(service.get('user:1')).resolves.toBeNull()
		})
	})
})
