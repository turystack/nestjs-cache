import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import { Redis } from 'ioredis'

import { CACHE_ADAPTER, CACHE_ADAPTER_REDIS } from '@/cache.constants.js'
import { CacheService } from '@/cache.service.js'
import type { CacheModuleOptions } from '@/cache.types.js'
import { RedisAdapter } from '@/redis/index.js'

@Module({})
export class CacheModule {
  static register(options: CacheModuleOptions): DynamicModule {
    return {
      exports: [CacheService],
      module: CacheModule,
      providers: [
        ...CacheModule._resolveProviders(options),
        CacheService,
      ],
    }
  }

  private static _resolveProviders(
    options: CacheModuleOptions,
  ): Provider[] {
    switch (options.adapter) {
      case 'redis':
        return [
          {
            provide: CACHE_ADAPTER_REDIS,
            useFactory: () =>
              new Redis(options.redis.url, {
                maxRetriesPerRequest: null,
                retryStrategy: (times: number) => Math.min(times * 200, 2000),
              }),
          },
          { provide: CACHE_ADAPTER, useClass: RedisAdapter },
        ]
    }
  }
}
