import { Test } from '@nestjs/testing'
import type { Redis } from 'ioredis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CACHE_ADAPTER_REDIS } from '@/cache.constants.js'
import { RedisAdapter } from '@/redis/redis.adapter.js'

describe('RedisAdapter', () => {
  let adapter: RedisAdapter
  let redisClient: Redis

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisAdapter,
        {
          provide: CACHE_ADAPTER_REDIS,
          useValue: {
            decr: vi.fn(),
            del: vi.fn(),
            exists: vi.fn(),
            get: vi.fn(),
            incr: vi.fn(),
            pexpire: vi.fn(),
            scan: vi.fn(),
            set: vi.fn(),
          },
        },
      ],
    }).compile()

    adapter = moduleRef.get<RedisAdapter>(RedisAdapter)
    redisClient = moduleRef.get<Redis>(CACHE_ADAPTER_REDIS)
  })

  describe('keys', () => {
    it('should return all keys matching pattern using SCAN', async () => {
      vi.mocked(redisClient.scan)
        .mockResolvedValueOnce(['5', ['key:1', 'key:2']])
        .mockResolvedValueOnce(['0', ['key:3']])

      const result = await adapter.keys('key:*')

      expect(redisClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'key:*',
        'COUNT',
        100,
      )
      expect(redisClient.scan).toHaveBeenCalledWith(
        '5',
        'MATCH',
        'key:*',
        'COUNT',
        100,
      )
      expect(result).toEqual(['key:1', 'key:2', 'key:3'])
    })

    it('should return empty array when no keys match', async () => {
      vi.mocked(redisClient.scan).mockResolvedValueOnce(['0', []])

      const result = await adapter.keys('nonexistent:*')

      expect(result).toEqual([])
    })

    it('should handle single iteration when cursor returns 0', async () => {
      vi.mocked(redisClient.scan).mockResolvedValueOnce(['0', ['single:key']])

      const result = await adapter.keys('single:*')

      expect(redisClient.scan).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['single:key'])
    })
  })

  describe('del', () => {
    it('should delete exact keys directly', async () => {
      vi.mocked(redisClient.del)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)

      const result = await adapter.del(['user:123', 'user:456'])

      expect(redisClient.del).toHaveBeenCalledWith('user:123')
      expect(redisClient.del).toHaveBeenCalledWith('user:456')
      expect(result).toBe(2)
    })

    it('should delete single exact key', async () => {
      vi.mocked(redisClient.del).mockResolvedValue(1)

      const result = await adapter.del(['user:123'])

      expect(redisClient.del).toHaveBeenCalledWith('user:123')
      expect(result).toBe(1)
    })

    it('should use SCAN for wildcard patterns and delete found keys', async () => {
      vi.mocked(redisClient.scan).mockResolvedValueOnce([
        '0',
        ['user:123:profile', 'user:123:settings'],
      ])
      vi.mocked(redisClient.del).mockResolvedValue(2)

      const result = await adapter.del(['user:123:*'])

      expect(redisClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'user:123:*',
        'COUNT',
        100,
      )
      expect(redisClient.del).toHaveBeenCalledWith(
        'user:123:profile',
        'user:123:settings',
      )
      expect(result).toBe(2)
    })

    it('should handle wildcard pattern with no matching keys', async () => {
      vi.mocked(redisClient.scan).mockResolvedValueOnce(['0', []])

      const result = await adapter.del(['nonexistent:*'])

      expect(redisClient.scan).toHaveBeenCalled()
      expect(redisClient.del).not.toHaveBeenCalled()
      expect(result).toBe(0)
    })

    it('should handle mixed exact keys and wildcard patterns', async () => {
      vi.mocked(redisClient.scan).mockResolvedValueOnce([
        '0',
        ['session:abc:token1', 'session:abc:token2'],
      ])
      vi.mocked(redisClient.del)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)

      const result = await adapter.del(['user:123', 'session:abc:*'])

      expect(redisClient.del).toHaveBeenCalledWith('user:123')
      expect(redisClient.del).toHaveBeenCalledWith(
        'session:abc:token1',
        'session:abc:token2',
      )
      expect(result).toBe(3)
    })

    it('should handle multiple wildcard patterns', async () => {
      vi.mocked(redisClient.scan)
        .mockResolvedValueOnce(['0', ['user:123:a', 'user:123:b']])
        .mockResolvedValueOnce(['0', ['session:123:x']])
      vi.mocked(redisClient.del)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)

      const result = await adapter.del(['user:123:*', 'session:123:*'])

      expect(result).toBe(3)
    })

    it('should return 0 when deleting non-existent exact key', async () => {
      vi.mocked(redisClient.del).mockResolvedValue(0)

      const result = await adapter.del(['nonexistent:key'])

      expect(result).toBe(0)
    })
  })

  describe('get', () => {
    it('should return value for existing key', async () => {
      vi.mocked(redisClient.get).mockResolvedValue('cached:value')

      const result = await adapter.get('my:key')

      expect(redisClient.get).toHaveBeenCalledWith('my:key')
      expect(result).toBe('cached:value')
    })

    it('should return null when key does not exist', async () => {
      vi.mocked(redisClient.get).mockResolvedValue(null)

      const result = await adapter.get('nonexistent:key')

      expect(redisClient.get).toHaveBeenCalledWith('nonexistent:key')
      expect(result).toBeNull()
    })
  })

  describe('exists', () => {
    it('should return true when key exists', async () => {
      vi.mocked(redisClient.exists).mockResolvedValue(1)

      const result = await adapter.exists('existing:key')

      expect(redisClient.exists).toHaveBeenCalledWith('existing:key')
      expect(result).toBe(true)
    })

    it('should return false when key does not exist', async () => {
      vi.mocked(redisClient.exists).mockResolvedValue(0)

      const result = await adapter.exists('nonexistent:key')

      expect(result).toBe(false)
    })
  })

  describe('set', () => {
    it('should call SET with PX and ttl converted to ms', async () => {
      vi.mocked(redisClient.set).mockResolvedValue('OK')

      const result = await adapter.set('my:key', 'my:value', { ttl: 5 })

      expect(redisClient.set).toHaveBeenCalledWith(
        'my:key',
        'my:value',
        'PX',
        5000,
      )
      expect(result).toBe(true)
    })

    it('should use default ttl of 3600s (3600000ms) when not provided', async () => {
      vi.mocked(redisClient.set).mockResolvedValue('OK')

      const result = await adapter.set('my:key', 'my:value')

      expect(redisClient.set).toHaveBeenCalledWith(
        'my:key',
        'my:value',
        'PX',
        3600000,
      )
      expect(result).toBe(true)
    })

    it('should include NX mode when specified', async () => {
      vi.mocked(redisClient.set).mockResolvedValue('OK')

      const result = await adapter.set('my:key', 'my:value', {
        mode: 'NX',
        ttl: 5,
      })

      expect(redisClient.set).toHaveBeenCalledWith(
        'my:key',
        'my:value',
        'PX',
        5000,
        'NX',
      )
      expect(result).toBe(true)
    })

    it('should include XX mode when specified', async () => {
      vi.mocked(redisClient.set).mockResolvedValue('OK')

      const result = await adapter.set('my:key', 'my:value', {
        mode: 'XX',
        ttl: 10,
      })

      expect(redisClient.set).toHaveBeenCalledWith(
        'my:key',
        'my:value',
        'PX',
        10000,
        'XX',
      )
      expect(result).toBe(true)
    })

    it('should return false when SET fails', async () => {
      vi.mocked(redisClient.set).mockResolvedValue(null)

      const result = await adapter.set('my:key', 'my:value', { ttl: 5 })

      expect(result).toBe(false)
    })
  })

  describe('incr', () => {
    it('should increment key and return new value', async () => {
      vi.mocked(redisClient.incr).mockResolvedValue(1)

      const result = await adapter.incr('counter:key')

      expect(redisClient.incr).toHaveBeenCalledWith('counter:key')
      expect(result).toBe(1)
    })

    it('should set pexpire when ttl is provided (converted to ms)', async () => {
      vi.mocked(redisClient.incr).mockResolvedValue(1)
      vi.mocked(redisClient.pexpire).mockResolvedValue(1)

      const result = await adapter.incr('counter:key', { ttl: 5 })

      expect(redisClient.incr).toHaveBeenCalledWith('counter:key')
      expect(redisClient.pexpire).toHaveBeenCalledWith('counter:key', 5000)
      expect(result).toBe(1)
    })

    it('should not set pexpire when ttl is not provided', async () => {
      vi.mocked(redisClient.incr).mockResolvedValue(3)

      await adapter.incr('counter:key')

      expect(redisClient.pexpire).not.toHaveBeenCalled()
    })
  })

  describe('decr', () => {
    it('should decrement key and return new value', async () => {
      vi.mocked(redisClient.decr).mockResolvedValue(4)

      const result = await adapter.decr('counter:key')

      expect(redisClient.decr).toHaveBeenCalledWith('counter:key')
      expect(result).toBe(4)
    })

    it('should return negative value when decrementing below zero', async () => {
      vi.mocked(redisClient.decr).mockResolvedValue(-1)

      const result = await adapter.decr('counter:key')

      expect(result).toBe(-1)
    })
  })
})
