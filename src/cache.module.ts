import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import { ConfigService } from '@turystack/nestjs-config'
import { Redis } from 'ioredis'

import {
	CACHE_ADAPTER,
	CACHE_ADAPTER_REDIS,
	CACHE_MODULE_OPTIONS,
} from '@/cache.constants.js'
import { CacheService } from '@/cache.service.js'
import type { CacheModuleOptions } from '@/cache.types.js'

import { RedisAdapter } from '@/redis/index.js'

@Module({})
export class CacheModule {
	/**
	 * Registers the cache globally: the adapter connection is created once and
	 * shared app-wide. Register it a single time in the app root; every other
	 * module (LockModule, RateLimitModule, domain services) reuses the same
	 * connection by injecting {@link CacheService} — or the raw client via the
	 * {@link CACHE_ADAPTER_REDIS} token.
	 *
	 * Accepts a plain options object or a `(config) => options` factory that
	 * receives the `ConfigService` from `@turystack/nestjs-config` at boot (requires
	 * `ConfigModule` to be registered).
	 */
	static register(
		options:
			| CacheModuleOptions
			| ((config: ConfigService) => CacheModuleOptions),
	): DynamicModule {
		return {
			exports: [
				CacheService,
				CACHE_ADAPTER,
				CACHE_ADAPTER_REDIS,
			],
			global: true,
			module: CacheModule,
			providers: [
				...CacheModule._resolveProviders(options),
				CacheService,
			],
		}
	}

	private static _resolveOptions(
		optionsOrFactory:
			| CacheModuleOptions
			| ((config: ConfigService) => CacheModuleOptions),
		config?: ConfigService,
	): CacheModuleOptions {
		if (typeof optionsOrFactory !== 'function') {
			return optionsOrFactory
		}

		if (!config) {
			throw new Error(
				'[CacheModule] register((config) => ...) requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		}

		return optionsOrFactory(config)
	}

	private static _resolveProviders(
		optionsOrFactory:
			| CacheModuleOptions
			| ((config: ConfigService) => CacheModuleOptions),
	): Provider[] {
		return [
			{
				inject: [
					{
						optional: true,
						token: ConfigService,
					},
				],
				provide: CACHE_MODULE_OPTIONS,
				useFactory: (config?: ConfigService) =>
					CacheModule._resolveOptions(optionsOrFactory, config),
			},
			{
				inject: [
					CACHE_MODULE_OPTIONS,
				],
				provide: CACHE_ADAPTER_REDIS,
				useFactory: (options: CacheModuleOptions) =>
					new Redis(options.redis.url, {
						maxRetriesPerRequest: null,
						retryStrategy: (times: number) => Math.min(times * 200, 2000),
					}),
			},
			{
				provide: CACHE_ADAPTER,
				useClass: RedisAdapter,
			},
		]
	}
}
