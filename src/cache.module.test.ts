import type { FactoryProvider, Provider } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ConfigModule } from '@turystack/nestjs-config'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
	CACHE_ADAPTER,
	CACHE_ADAPTER_REDIS,
	CACHE_MODULE_OPTIONS,
} from '@/cache.constants.js'
import { CacheModule } from '@/cache.module.js'
import { CacheService } from '@/cache.service.js'

import { RedisAdapter } from '@/redis/index.js'

vi.mock('ioredis', () => ({
	Redis: vi.fn(),
}))

const findProvider = (providers: Provider[], token: unknown) =>
	providers.find(
		(provider) =>
			typeof provider === 'object' &&
			'provide' in provider &&
			provider.provide === token,
	)

describe('CacheModule', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	describe('register', () => {
		it('should expose CacheService and bind the redis adapter', () => {
			const dynamicModule = CacheModule.register({
				adapter: 'redis',
				redis: {
					url: 'redis://localhost:6379',
				},
			})

			expect(dynamicModule.module).toBe(CacheModule)
			expect(dynamicModule.global).toBe(true)
			expect(dynamicModule.exports).toEqual([
				CacheService,
				CACHE_ADAPTER,
				CACHE_ADAPTER_REDIS,
			])

			const providers = dynamicModule.providers ?? []
			expect(providers).toContain(CacheService)
			expect(findProvider(providers, CACHE_ADAPTER)).toMatchObject({
				useClass: RedisAdapter,
			})
			expect(findProvider(providers, CACHE_ADAPTER_REDIS)).toBeDefined()
		})

		it('should create the redis client with the configured url', () => {
			const dynamicModule = CacheModule.register({
				adapter: 'redis',
				redis: {
					url: 'redis://cache:6379',
				},
			})

			const providers = dynamicModule.providers ?? []
			const optionsProvider = findProvider(
				providers,
				CACHE_MODULE_OPTIONS,
			) as FactoryProvider
			const redisProvider = findProvider(
				providers,
				CACHE_ADAPTER_REDIS,
			) as FactoryProvider

			redisProvider.useFactory(optionsProvider.useFactory())

			expect(Redis).toHaveBeenCalledWith(
				'redis://cache:6379',
				expect.objectContaining({
					maxRetriesPerRequest: null,
				}),
			)
		})

		it('should back off retries capped at 2 seconds', () => {
			const dynamicModule = CacheModule.register({
				adapter: 'redis',
				redis: {
					url: 'redis://cache:6379',
				},
			})

			const providers = dynamicModule.providers ?? []
			const optionsProvider = findProvider(
				providers,
				CACHE_MODULE_OPTIONS,
			) as FactoryProvider
			const redisProvider = findProvider(
				providers,
				CACHE_ADAPTER_REDIS,
			) as FactoryProvider

			redisProvider.useFactory(optionsProvider.useFactory())

			const [, options] = vi.mocked(Redis).mock.calls[0] as unknown as [
				string,
				{
					retryStrategy: (times: number) => number
				},
			]
			expect(options.retryStrategy(1)).toBe(200)
			expect(options.retryStrategy(5)).toBe(1000)
			expect(options.retryStrategy(100)).toBe(2000)
		})

		it('should resolve options from a config factory', async () => {
			vi.stubEnv('REDIS_URL', 'redis://config:6379')

			const moduleRef = await Test.createTestingModule({
				imports: [
					ConfigModule.register({
						envFilePath: false,
						schema: {
							REDIS_URL: z.string(),
						},
					}),
					CacheModule.register((config) => ({
						adapter: 'redis',
						redis: {
							url: config.get('REDIS_URL') as string,
						},
					})),
				],
			}).compile()

			expect(moduleRef.get(CacheService)).toBeInstanceOf(CacheService)
			expect(Redis).toHaveBeenCalledWith(
				'redis://config:6379',
				expect.objectContaining({
					maxRetriesPerRequest: null,
				}),
			)
		})

		it('should reject a config factory without ConfigModule', async () => {
			await expect(
				Test.createTestingModule({
					imports: [
						CacheModule.register((config) => ({
							adapter: 'redis',
							redis: {
								url: config.get('REDIS_URL') as string,
							},
						})),
					],
				}).compile(),
			).rejects.toThrow(
				'requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		})
	})
})
