import type { Db, Document } from 'mongodb';

export type Reading<T> = { status: 'available'; value: T } | { status: 'unavailable'; reason: string };
const number = (v: unknown): number | null => v == null || !Number.isFinite(Number(v)) ? null : Number(v);
async function reading<T>(fn: () => Promise<T>): Promise<Reading<T>> {
  try { return { status: 'available', value: await fn() }; }
  catch { return { status: 'unavailable', reason: 'The database did not return this reading.' }; }
}

/** One in-flight read per key. Failures never become healthy or silently replace last-good data. */
export class HealthCache {
  private entries = new Map<string, { expires: number; value?: unknown; pending?: Promise<unknown> }>();
  constructor(private now = Date.now) {}
  async get<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const old = this.entries.get(key);
    if (old?.pending) return old.pending as Promise<T>;
    if (old && old.expires > this.now()) return old.value as T;
    if (this.entries.size >= 505 && !old) this.entries.delete(this.entries.keys().next().value!);
    const entry: { expires: number; value?: unknown; pending?: Promise<unknown> } = { expires: 0 };
    entry.pending = load().then(value => { entry.value = value; entry.expires = this.now() + ttl; entry.pending = undefined; return value; })
      .catch(error => { this.entries.delete(key); throw error; });
    this.entries.set(key, entry);
    return entry.pending as Promise<T>;
  }
}

export class MongoHealthService {
  private cache = new HealthCache();
  constructor(private database: () => Promise<Db>) {}

  summary() {
    return this.cache.get('summary', 60_000, async () => {
      const db = await this.database();
      const startedAt = new Date().toISOString();
      const command = (value: Document) => db.command(value, { timeoutMS: 5000 });
      const [ping, storage, server, replica] = await Promise.all([
        reading(async () => { const start = performance.now(); await command({ ping: 1 }); return { milliseconds: Math.round((performance.now() - start) * 10) / 10 }; }),
        reading(async () => {
          const s = await command({ dbStats: 1, scale: 1 });
          return { collections: number(s.collections), documents: number(s.objects), logicalBytes: number(s.dataSize),
            storageBytes: number(s.storageSize), indexBytes: number(s.indexSize), indexes: number(s.indexes),
            diskUsedBytes: number(s.fsUsedSize), diskTotalBytes: number(s.fsTotalSize) };
        }),
        reading(async () => {
          const s = await db.admin().command({ serverStatus: 1 }, { timeoutMS: 5000 });
          return { version: String(s.version ?? 'Unknown'), uptimeSeconds: number(s.uptime),
            connections: { current: number(s.connections?.current), available: number(s.connections?.available), active: number(s.connections?.active), rejectedSinceStart: number(s.connections?.rejected) },
            residentMemoryMiB: number(s.mem?.resident), cacheBytes: number(s.wiredTiger?.cache?.['bytes currently in the cache']),
            cacheLimitBytes: number(s.wiredTiger?.cache?.['maximum bytes configured']) };
        }),
        reading(async () => {
          const r = await db.admin().command({ replSetGetStatus: 1 }, { timeoutMS: 5000 });
          const members = r.members as Document[];
          const primary = members.find(m => m.stateStr === 'PRIMARY');
          const time = primary?.optimeDate ? new Date(primary.optimeDate).getTime() : null;
          return { members: members.map((m, i) => ({ member: i + 1, state: String(m.stateStr), healthy: m.health === 1,
            lagSeconds: time != null && m.optimeDate && ['PRIMARY', 'SECONDARY'].includes(m.stateStr)
              ? Math.max(0, (time - new Date(m.optimeDate).getTime()) / 1000) : null })) };
        }),
      ]);
      return { database: db.databaseName, startedAt, sampledAt: new Date().toISOString(), cacheSeconds: 60,
        scope: 'Selected-node metrics and the primary’s view of the replica set.', ping, storage, server, replica };
    });
  }

  collections() {
    return this.cache.get('collections', 300_000, async () => {
      const db = await this.database();
      const startedAt = new Date().toISOString();
      const listed = await db.listCollections({}, { nameOnly: true, timeoutMS: 5000 }).toArray();
      if (listed.length > 500) throw new Error('Collection inventory exceeds the bounded report limit');
      let cursor = 0;
      const rows: { name: string; type: string; storage: Reading<ReturnType<typeof collectionStorage>> }[] = [];
      const deadline = Date.now() + 22_000;
      // Two workers: inventory must not monopolize the shared five-connection pool.
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (cursor < listed.length) {
          const item = listed[cursor++]!;
          const storage = item.type === 'view' ? { status: 'unavailable' as const, reason: 'Views do not allocate document storage.' }
            : Date.now() > deadline ? { status: 'unavailable' as const, reason: 'The collection inventory time budget was reached.' }
            : await reading(async () => {
              const parts = await db.collection(item.name).aggregate([
                { $collStats: { storageStats: { scale: 1 }, latencyStats: {}, queryExecStats: {} } },
                { $project: { _id: 0, 'storageStats.count': 1, 'storageStats.size': 1, 'storageStats.storageSize': 1,
                  'storageStats.totalIndexSize': 1, 'storageStats.freeStorageSize': 1, 'storageStats.nindexes': 1,
                  latencyStats: 1, queryExecStats: 1 } },
              ], { maxTimeMS: 4000, timeoutMS: 5000 }).toArray();
              return collectionStorage(parts);
            });
          rows.push({ name: item.name, type: item.type ?? 'collection', storage });
        }
      }));
      rows.sort((a, b) => allocation(b.storage) - allocation(a.storage) || a.name.localeCompare(b.name));
      return { database: db.databaseName, startedAt, sampledAt: new Date().toISOString(), cacheSeconds: 300,
        total: listed.length, available: rows.filter(r => r.storage.status === 'available').length, collections: rows };
    });
  }

  indexes(name: string) {
    return this.cache.get(`indexes:${name}`, 300_000, async () => {
      const inventory = await this.collections();
      if (!inventory.collections.some(c => c.name === name && c.type !== 'view')) return null;
      const db = await this.database();
      const collection = db.collection(name);
      const [definitions, usage, sizes] = await Promise.all([
        reading(async () => (await collection.listIndexes({ timeoutMS: 5000 }).toArray()).map(i => ({
          name: String(i.name), keys: i.key, unique: i.unique === true, hidden: i.hidden === true,
          ttlSeconds: number(i.expireAfterSeconds), partial: !!i.partialFilterExpression, sparse: i.sparse === true,
        }))),
        reading(async () => (await collection.aggregate([{ $indexStats: {} }, { $project: { _id: 0, name: 1, accesses: 1 } }],
          { maxTimeMS: 4000, timeoutMS: 5000 }).toArray()).map(i => ({ name: String(i.name), operations: number(i.accesses?.ops), since: i.accesses?.since ?? null }))),
        reading(async () => (await collection.aggregate([{ $collStats: { storageStats: { scale: 1 } } },
          { $project: { _id: 0, 'storageStats.indexSizes': 1 } }], { maxTimeMS: 4000, timeoutMS: 5000 }).toArray())
          .map(p => p.storageStats?.indexSizes as Record<string, number> ?? {})),
      ]);
      return { name, sampledAt: new Date().toISOString(), cacheSeconds: 300, definitions, usage, sizes };
    });
  }
}

function allocation(r: Reading<ReturnType<typeof collectionStorage>>) {
  return r.status === 'available' ? (r.value.storageBytes ?? 0) + (r.value.indexBytes ?? 0) : -1;
}
function collectionStorage(parts: Document[]) {
  const sum = (key: string) => parts.length && parts.every(p => number(p.storageStats?.[key]) != null)
    ? parts.reduce((total, p) => total + Number(p.storageStats[key]), 0) : null;
  const latency = (kind: string) => {
    if (!parts.length || parts.some(p => number(p.latencyStats?.[kind]?.ops) == null)) return null;
    const operations = parts.reduce((n, p) => n + Number(p.latencyStats[kind].ops), 0);
    return { operations, averageMs: operations > 0 ? parts.reduce((n, p) => n + Number(p.latencyStats[kind].latency), 0) / operations / 1000 : null };
  };
  return { documents: sum('count'), logicalBytes: sum('size'), storageBytes: sum('storageSize'), indexBytes: sum('totalIndexSize'),
    reusableBytes: sum('freeStorageSize'), indexCount: parts.length === 1 ? number(parts[0]?.storageStats?.nindexes) : null,
    reads: latency('reads'), writes: latency('writes'),
    collectionScansSinceStart: parts.every(p => number(p.queryExecStats?.collectionScans?.total) != null)
      ? parts.reduce((n, p) => n + Number(p.queryExecStats.collectionScans.total), 0) : null };
}
