import { Inject } from '@nestjs/common'

import type { CacheOptions } from '@/cache.adapter.interface.js'
import { CacheService } from '@/cache.service.js'

/**
 * Resolves a cache key from a static string or a function that receives the method arguments.
 *
 * @example
 * ```ts
 * // Static key
 * @Cache.Get('users:all')
 *
 * // Dynamic key from arguments
 * @Cache.Get((args) => `user:${args[0]}`)
 * ```
 */
export type CacheKeyResolver<T extends unknown[] = unknown[]> =
  | string
  | ((args: T) => string | Promise<string>)

/**
 * Resolves one or more cache keys for deletion.
 * Accepts a static string, an array of strings, or a function.
 *
 * @example
 * ```ts
 * @Cache.Del(['users:all', 'users:count'])
 * @Cache.Del((args) => `user:${args[0]}`)
 * ```
 */
export type CacheDelKeyResolver<T extends unknown[] = unknown[]> =
  | string
  | string[]
  | ((args: T) => string | string[] | Promise<string | string[]>)

export async function resolveCacheKey<T extends unknown[] = unknown[]>(
  keyResolver: CacheKeyResolver<T>,
  payload: T,
): Promise<string> {
  if (typeof keyResolver === 'string') {
    return keyResolver
  }
  return keyResolver(payload)
}

export async function resolveCacheDelKeys<T extends unknown[] = unknown[]>(
  keyResolver: CacheDelKeyResolver<T>,
  payload: T,
): Promise<string[]> {
  if (typeof keyResolver === 'string') {
    return [keyResolver]
  }
  if (Array.isArray(keyResolver)) {
    return keyResolver
  }
  const result = await keyResolver(payload)
  return Array.isArray(result) ? result : [result]
}

function createCacheDecorator(
  handler: (
    cacheService: CacheService,
    args: unknown[],
    originalMethod: Function,
    context: unknown,
  ) => Promise<unknown>,
): MethodDecorator {
  return (
    target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Inject(CacheService)(target, 'cacheService')
    const originalMethod = descriptor.value

    descriptor.value = async function (
      this: Record<string, unknown>,
      ...args: unknown[]
    ) {
      const cacheService = this.cacheService as CacheService | undefined
      if (!cacheService) {
        return originalMethod.apply(this, args)
      }
      return handler(cacheService, args, originalMethod, this)
    }

    return descriptor
  }
}

/**
 * Method decorators for declarative cache operations.
 *
 * All decorators auto-inject {@link CacheService} into the class instance
 * (no need to declare it in the constructor).
 *
 * @example
 * ```ts
 * import { Cache } from '@turystack/nestjs-cache'
 *
 * class UsersService {
 *   @Cache.Get((args) => `user:${args[0]}`, { ttl: 60 })
 *   async findById(id: string) { ... }
 *
 *   @Cache.Del((args) => `user:${args[0]}`)
 *   async remove(id: string) { ... }
 * }
 * ```
 */
export const Cache = {
  /**
   * Executes the method, then **deletes** the resolved cache key(s).
   *
   * Deletion errors are logged but do not propagate.
   *
   * @param key - Static key, array of keys, or resolver function receiving the method arguments.
   */
  Del: <T extends unknown[] = unknown[]>(
    key: CacheDelKeyResolver<T>,
  ): MethodDecorator =>
    createCacheDecorator(
      async (cacheService, args, originalMethod, context) => {
        const result = await originalMethod.apply(context, args)

        try {
          const keys = await resolveCacheDelKeys(key, args as T)

          if (keys.length > 0) {
            await cacheService.del(keys)
          }
        } catch (error) {
          console.error(`[Cache.Del] Invalidation failed:`, error)
        }

        return result
      },
    ),

  /**
   * Cache-aside (read-through) decorator.
   *
   * 1. Resolves the cache key from the method arguments.
   * 2. Returns the cached value if present.
   * 3. Otherwise executes the method, caches the result, and returns it.
   *
   * @param key - Static key or resolver function receiving the method arguments.
   * @param options - Optional TTL and write mode.
   */
  Get: <T extends unknown[] = unknown[]>(
    key: CacheKeyResolver<T>,
    options?: CacheOptions,
  ): MethodDecorator =>
    createCacheDecorator(
      async (cacheService, args, originalMethod, context) => {
        const resolvedKey = await resolveCacheKey(key, args as T)

        const cachedValue = await cacheService.get(resolvedKey)
        if (cachedValue !== null && cachedValue !== undefined) {
          return cachedValue
        }

        const result = await originalMethod.apply(context, args)

        if (result !== undefined && result !== null) {
          cacheService.set(resolvedKey, result, options ?? {}).catch((err) => {
            console.error(`[Cache.Get] Set failed for key ${resolvedKey}:`, err)
          })
        }

        return result
      },
    ),
}
