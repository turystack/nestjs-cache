# Cache

Caching module with pluggable storage adapters, decorator support, and superjson serialization. Storage is adapter-based — Redis is the built-in adapter option.

## Setup

Register the module **once** in the app root with the adapter of your choice (Redis is the built-in option). Registration is global: the adapter connection is created once and shared app-wide — `LockModule`, `RateLimitModule`, and any domain service reuse the same connection instead of opening their own.

```ts
import { CacheModule } from '@turystack/nestjs-cache'
import { ConfigModule, defineConfigSchema } from '@turystack/nestjs-config'
import { z } from 'zod'

export const configSchema = defineConfigSchema({
  REDIS_URL: z.string(),
})

declare module '@turystack/nestjs-config' {
  interface ConfigSchemaRegistry {
    schema: typeof configSchema
  }
}

@Module({
  imports: [
    ConfigModule.register({ schema: configSchema }),
    CacheModule.register((config) => ({
      adapter: 'redis',
      redis: { url: config.get('REDIS_URL') },
    })),
  ],
})
class AppModule {}
```

`register` also accepts a plain options object; the `(config) => options` form injects the `ConfigService` at boot.

Domain services (e.g. in monorepo libs) don't register anything — they just inject `CacheService`:

```ts
@Injectable()
class DomainService {
  constructor(private readonly cache: CacheService) {}
}
```

Advanced: the raw adapter client is available for injection via the exported `CACHE_ADAPTER_REDIS` token, and the active adapter via `CACHE_ADAPTER`.

## CacheService

Injectable service available after module registration.

```ts
import { CacheService } from '@turystack/nestjs-cache'

class MyService {
  constructor(private readonly cache: CacheService) {}

  async example() {
    await cache.set('user:123', { name: 'John' }, { ttl: 60000 })
    const user = await cache.get<{ name: string }>('user:123')
    await cache.del(['user:123'])
  }
}
```

### Methods

| Method | Signature | Description |
|---|---|---|
| `get` | `get<T>(key: string): Promise<T \| null>` | Get and parse with superjson |
| `set` | `set<T>(key: string, value: T, options: CacheOptions): Promise<boolean>` | Serialize with superjson and store |
| `del` | `del(keys: string[]): Promise<number>` | Delete keys (supports wildcards) |
| `keys` | `keys(pattern: string): Promise<string[]>` | Find keys by pattern |
| `exists` | `exists(key: string): Promise<boolean>` | Check if key exists |
| `remember` | `remember(key: string, value: string, options?: CacheOptions): Promise<string>` | Atomic get-or-set (Lua script) |
| `hgetdel` | `hgetdel(key: string, options?: HGetDelManyOptions): Promise<Record<string, string> \| null>` | Atomic hash get and delete |
| `hincrby` | `hincrby(key: string, field: string, value: number): Promise<number>` | Increment hash field |
| `incr` | `incr(key: string, options?: { ttl?: number }): Promise<number>` | Atomic increment (no superjson) |
| `decr` | `decr(key: string): Promise<number>` | Atomic decrement (no superjson) |

## Decorators

Method decorators that auto-inject `CacheService` and manage cache transparently.

### `@Cache.Get(key, options?)`

Returns cached value on HIT, executes method and caches result on MISS.

```ts
@Cache.Get<[{ id: string }]>(([dto]) => `user:${dto.id}`, { ttl: 60000 })
async getUser(dto: { id: string }) {
  return this.db.findUser(dto.id)
}
```

### `@Cache.Set(key, options?)`

Executes method, then caches the result.

```ts
@Cache.Set<User>((user) => `user:${user.id}`, { ttl: 60000 })
async createUser(dto: CreateUserDto) {
  return this.db.createUser(dto)
}
```

### `@Cache.Del(key)`

Executes method, then invalidates cache keys.

```ts
@Cache.Del<[{ id: string }]>(([dto]) => [`user:${dto.id}`, 'users:list'])
async deleteUser(dto: { id: string }) {
  return this.db.deleteUser(dto.id)
}
```

## Types

```ts
type CacheModuleOptions = {
  adapter: 'redis' // storage adapter to use; Redis is the built-in option
  redis: { url: string } // connection config for the 'redis' adapter
}
type CacheOptions = { mode?: 'NX'; ttl?: number }
type HGetDelManyOptions = { extraKeysToDel?: string[] }
```

## Adapters

Storage is abstracted behind the `ICacheAdapter` interface (exported, along with the `CACHE_ADAPTER` DI token). Each adapter provides the low-level key/value operations; the module and decorators are storage-agnostic.

Built-in adapters:

| Adapter | Backed by | Notes |
|---|---|---|
| `'redis'` | ioredis | SCAN-based key lookup, Lua scripts for atomic operations, wildcard pattern deletion |

To add a new provider, implement `ICacheAdapter` and bind it to the `CACHE_ADAPTER` token.
