/** DI token for the active {@link ICacheAdapter} implementation. */
export const CACHE_ADAPTER = Symbol('CACHE_ADAPTER')

/** DI token for the underlying `ioredis` client instance. */
export const CACHE_ADAPTER_REDIS = Symbol('CACHE_ADAPTER_REDIS')

/** DI token for the resolved {@link CacheModuleOptions}. */
export const CACHE_MODULE_OPTIONS = Symbol('CACHE_MODULE_OPTIONS')
