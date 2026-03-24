import { Test } from '@nestjs/testing'
import superjson from 'superjson'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ICacheAdapter } from '@/cache.adapter.interface.js'
import { CACHE_ADAPTER } from '@/cache.constants.js'
import { CacheService } from '@/cache.service.js'

describe('CacheService', () => {
  let service: CacheService
  let adapter: ICacheAdapter

  beforeEach(async () => {
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
      ],
    }).compile()

    service = moduleRef.get<CacheService>(CacheService)
    adapter = moduleRef.get<ICacheAdapter>(CACHE_ADAPTER)
  })

  describe('keys', () => {
    it('should delegate to adapter.keys', async () => {
      const pattern = 'user:*'
      const expected = ['user:1', 'user:2', 'user:3']

      vi.mocked(adapter.keys).mockResolvedValue(expected)

      const result = await service.keys(pattern)

      expect(adapter.keys).toHaveBeenCalledWith(pattern)
      expect(result).toEqual(expected)
    })

    it('should return empty array when no keys match', async () => {
      vi.mocked(adapter.keys).mockResolvedValue([])

      const result = await service.keys('nonexistent:*')

      expect(result).toEqual([])
    })
  })

  describe('get', () => {
    it('should delegate to adapter.get and parse with superjson', async () => {
      const key = 'user:123'
      const payload = { name: 'John' }
      const serialized = superjson.stringify(payload)

      vi.mocked(adapter.get).mockResolvedValue(serialized)

      const result = await service.get(key)

      expect(adapter.get).toHaveBeenCalledWith(key)
      expect(result).toEqual(payload)
    })

    it('should return null when key does not exist', async () => {
      vi.mocked(adapter.get).mockResolvedValue(null)

      const result = await service.get('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('del', () => {
    it('should delegate to adapter.del with array of keys', async () => {
      const keys = ['user:123', 'user:456']

      vi.mocked(adapter.del).mockResolvedValue(1)

      await service.del(keys)

      expect(adapter.del).toHaveBeenCalledWith(keys)
    })
  })

  describe('exists', () => {
    it('should delegate to adapter.exists and return true', async () => {
      const key = 'user:123'

      vi.mocked(adapter.exists).mockResolvedValue(true)

      const result = await service.exists(key)

      expect(adapter.exists).toHaveBeenCalledWith(key)
      expect(result).toBe(true)
    })

    it('should delegate to adapter.exists and return false', async () => {
      vi.mocked(adapter.exists).mockResolvedValue(false)

      const result = await service.exists('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('set', () => {
    it('should serialize with superjson and delegate to adapter.set', async () => {
      const key = 'user:123'
      const value = { name: 'John' }
      const options = { ttl: 3600 }

      const serialized = superjson.stringify(value)

      vi.mocked(adapter.set).mockResolvedValue(true)

      await service.set(key, value, options)

      expect(adapter.set).toHaveBeenCalledWith(key, serialized, options)
    })

    it('should serialize and delegate to adapter.set without options', async () => {
      const key = 'user:456'
      const value = { name: 'Jane' }

      const serialized = superjson.stringify(value)

      vi.mocked(adapter.set).mockResolvedValue(true)

      await service.set(key, value)

      expect(adapter.set).toHaveBeenCalledWith(key, serialized, undefined)
    })
  })

  describe('incr', () => {
    it('should delegate to adapter.incr without options', async () => {
      vi.mocked(adapter.incr).mockResolvedValue(1)

      const result = await service.incr('counter:key')

      expect(adapter.incr).toHaveBeenCalledWith('counter:key', undefined)
      expect(result).toBe(1)
    })

    it('should delegate to adapter.incr with ttl in seconds', async () => {
      vi.mocked(adapter.incr).mockResolvedValue(5)

      const result = await service.incr('counter:key', { ttl: 5 })

      expect(adapter.incr).toHaveBeenCalledWith('counter:key', { ttl: 5 })
      expect(result).toBe(5)
    })
  })

  describe('decr', () => {
    it('should delegate to adapter.decr', async () => {
      vi.mocked(adapter.decr).mockResolvedValue(4)

      const result = await service.decr('counter:key')

      expect(adapter.decr).toHaveBeenCalledWith('counter:key')
      expect(result).toBe(4)
    })
  })
})
