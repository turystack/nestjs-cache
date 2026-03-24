import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Cache,
  resolveCacheDelKeys,
  resolveCacheKey,
} from '@/cache.decorator.js'
import type { CacheService } from '@/cache.service.js'

const mockCacheService = {
  del: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as CacheService

class TestService {
  public cacheService = mockCacheService

  @Cache.Get<[]>('static:key')
  async getStatic() {
    return 'value-from-db'
  }

  @Cache.Get<[{ id: string }]>(([args]) => `dynamic:${args.id}`, { ttl: 100 })
  async getDynamic(dto: { id: string }) {
    return `value-${dto.id}`
  }

  @Cache.Del<[]>('static:key')
  async deleteStatic() {
    return 'deleted'
  }

  @Cache.Del<[{ id: string }]>(([args]) => [`user:${args.id}`, 'users:list'])
  async deleteDynamic(_: { id: string }) {
    return 'deleted'
  }

}

describe('Cache Decorators', () => {
  let service: TestService

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(mockCacheService.set).mockResolvedValue(true)
    vi.mocked(mockCacheService.del).mockResolvedValue(1)
    vi.mocked(mockCacheService.get).mockResolvedValue(null)

    service = new TestService()
    service.cacheService = mockCacheService
  })

  describe('Helpers', () => {
    describe('resolveCacheKey', () => {
      it('should return static string key as-is', async () => {
        const result = await resolveCacheKey('static:key', [{ id: '123' }])
        expect(result).toBe('static:key')
      })

      it('should resolve key from sync function using context', async () => {
        const keyFn = ([dto]: [{ id: string }]) => `dynamic:${dto.id}`
        const result = await resolveCacheKey(keyFn, [{ id: '456' }])
        expect(result).toBe('dynamic:456')
      })
    })

    describe('resolveCacheDelKeys', () => {
      it('should return static string as array', async () => {
        const result = await resolveCacheDelKeys('single:key', [{}])
        expect(result).toEqual(['single:key'])
      })

      it('should resolve function returning string to array', async () => {
        const keyFn = ([dto]: [{ id: string }]) => `user:${dto.id}`
        const result = await resolveCacheDelKeys(keyFn, [{ id: '123' }])
        expect(result).toEqual(['user:123'])
      })
    })
  })

  describe('Cache.Get', () => {
    it('should return cached value if exists (Cache HIT)', async () => {
      vi.mocked(mockCacheService.get).mockResolvedValue('cached-value')

      const result = await service.getStatic()

      expect(mockCacheService.get).toHaveBeenCalledWith('static:key')
      expect(result).toBe('cached-value')
    })

    it('should execute method and set cache if empty (Cache MISS)', async () => {
      vi.mocked(mockCacheService.set).mockResolvedValue(true)

      const result = await service.getStatic()

      expect(mockCacheService.get).toHaveBeenCalledWith('static:key')
      expect(result).toBe('value-from-db')
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'static:key',
        'value-from-db',
        expect.anything(),
      )
    })

    it('should resolve dynamic key based on arguments', async () => {
      const dto = { id: '999' }
      const result = await service.getDynamic(dto)

      expect(mockCacheService.get).toHaveBeenCalledWith('dynamic:999')
      expect(result).toBe('value-999')
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'dynamic:999',
        'value-999',
        expect.objectContaining({ ttl: 100 }),
      )
    })
  })

  describe('Cache.Del', () => {
    it('should execute method first, then delete keys', async () => {
      const result = await service.deleteStatic()

      expect(result).toBe('deleted')
      expect(mockCacheService.del).toHaveBeenCalledWith(['static:key'])
    })

    it('should resolve dynamic keys to delete based on arguments', async () => {
      const dto = { id: '555' }
      await service.deleteDynamic(dto)

      expect(mockCacheService.del).toHaveBeenCalledWith([
        'user:555',
        'users:list',
      ])
    })
  })

})
