import { Inject, Injectable } from '@nestjs/common'
import type { Redis } from 'ioredis'

import type { CacheOptions, ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER_REDIS } from '@/cache.constants.js'

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

  async incr(key: string, options?: { ttl?: number }) {
    const value = await this.client.incr(key)
    if (options?.ttl) {
      await this.client.pexpire(key, options.ttl * 1000)
    }
    return value
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
