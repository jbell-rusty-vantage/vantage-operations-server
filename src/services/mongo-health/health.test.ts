import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Db } from 'mongodb';
import { test } from 'node:test';
import { createApp } from '../../app';
import { readConfig } from '../../config';
import { healthCanonical } from './auth';
import { HealthCache, MongoHealthService } from './service';

const secret = 'mongo-health-offline-test-key-00000000000';
const target = '/api/v1/mongo-health/summary';
function headers(path = target, timestamp = String(Date.now()), role = 'owner', scope = 'mongo-health') {
  const actor = '6a0000000000000000000001', id = randomUUID();
  const canonical = healthCanonical(actor, timestamp, id, path).replace('\nmongo-health\n', `\n${scope}\n`);
  return { 'x-vantage-operations-actor-id': actor, 'x-vantage-operations-role': role,
    'x-vantage-operations-timestamp': timestamp, 'x-vantage-operations-request-id': id,
    'x-vantage-operations-signature': createHmac('sha256', secret).update(canonical).digest('hex') };
}
test('only current signed Owners can reach health; pricing assertions, target changes and service secrets fail', async t => {
  let calls = 0;
  const service = { summary: async () => { calls++; return { sampledAt: 'test' }; } } as unknown as MongoHealthService;
  const app = createApp({ config: readConfig({ LOG_LEVEL: 'silent', OPERATIONS_ADMIN_SIGNING_SECRET: secret }), mongoHealth: service });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const deniedHeaders: Record<string, string>[] = [{}, { 'x-api-secret': secret }, headers(target, String(Date.now() - 31_000)),
    headers(target, String(Date.now() + 6000)), headers(target, undefined, 'admin'), headers(target, undefined, 'owner', 'transportation-pricing'),
    { ...headers(), authorization: 'Bearer test' }, { ...headers(), 'x-vantage-operations-signature': 'a'.repeat(64) }];
  for (const denied of deniedHeaders) {
    const r = await fetch(base + target, { headers: denied });
    assert.equal(r.status, 401); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(base + target + '?refresh=1', { headers: headers() })).status, 401);
  assert.equal((await fetch(base + '/api/v1/mongo-health/collections', { headers: headers() })).status, 401);
  assert.equal(calls, 0);
  const allowed = await fetch(base + target, { headers: headers() });
  assert.equal(allowed.status, 200); assert.equal(calls, 1);
});
test('cache coalesces concurrent inventory reads, respects TTL, and retries failures', async () => {
  let now = 0, calls = 0;
  const cache = new HealthCache(() => now);
  const load = async () => { calls++; return calls; };
  assert.deepEqual(await Promise.all([cache.get('inventory', 10, load), cache.get('inventory', 10, load)]), [1, 1]);
  now = 9; assert.equal(await cache.get('inventory', 10, load), 1);
  now = 10; assert.equal(await cache.get('inventory', 10, load), 2);
  await assert.rejects(cache.get('failure', 10, async () => { throw new Error('failed'); }));
  assert.equal(await cache.get('failure', 10, async () => 'retried'), 'retried');
});
test('summary exposes safe unavailable readings and never prints raw database errors', async () => {
  const db = { databaseName: 'offline', command: async (c: Record<string, unknown>) => {
    if (c.ping) return { ok: 1 }; throw new Error('mongodb://private-password@private-host');
  }, admin: () => ({ command: async () => { throw new Error('private-host'); } }) } as unknown as Db;
  const summary = await new MongoHealthService(async () => db).summary();
  assert.equal(summary.ping.status, 'available'); assert.equal(summary.server.status, 'unavailable');
  assert.equal(summary.replica.status, 'unavailable'); assert.equal(summary.storage.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(summary), /private/);
});
test('collection reads use metadata only; partial failures remain unavailable; unknown index targets are refused', async () => {
  let indexReads = 0;
  const db = { databaseName: 'offline', listCollections: () => ({ toArray: async () => [{ name: 'large', type: 'collection' }, { name: 'missing', type: 'collection' }, { name: 'view', type: 'view' }] }),
    collection: (name: string) => ({ aggregate: (pipeline: Record<string, unknown>[]) => ({ toArray: async () => {
      assert.ok(pipeline[0]?.$collStats); if (name === 'missing') throw new Error('gone');
      return [{ storageStats: { count: 5, size: 100, storageSize: 60, totalIndexSize: 20, freeStorageSize: 10, nindexes: 2 },
        latencyStats: { reads: { ops: 2, latency: 6000 }, writes: { ops: 0, latency: 0 } }, queryExecStats: { collectionScans: { total: 0 } } }];
    } }), listIndexes: () => { indexReads++; throw new Error('must be on demand'); } }) } as unknown as Db;
  const service = new MongoHealthService(async () => db);
  const report = await service.collections();
  assert.equal(report.available, 1); assert.equal(report.total, 3); assert.equal(indexReads, 0);
  assert.equal(report.collections[0]?.name, 'large');
  const value = report.collections[0]!.storage;
  assert.equal(value.status === 'available' && value.value.reads?.averageMs, 3);
  assert.equal(value.status === 'available' && value.value.writes?.averageMs, null);
  assert.equal(await service.indexes('not-in-inventory'), null); assert.equal(indexReads, 0);
});
