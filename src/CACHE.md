# Cache

Redis-based caching module with decorator support and superjson serialization.

## Setup

```ts
import { CacheModule } from 'aw-backend/cache'

CacheModule.register({
  adapter: 'redis',
  redis: { url: 'redis://localhost:6379' },
})
```

## CacheService

Injectable service available after module registration.

```ts
import { CacheService } from 'aw-backend/cache'

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
  adapter: 'redis'
  redis: { url: string }
}
type CacheOptions = { mode?: 'NX'; ttl?: number }
type HGetDelManyOptions = { extraKeysToDel?: string[] }
```

## Adapter

The module uses `ICacheAdapter` internally. The default implementation is `RedisAdapter` backed by ioredis with SCAN-based key lookup, Lua scripts for atomic operations, and wildcard pattern deletion.
