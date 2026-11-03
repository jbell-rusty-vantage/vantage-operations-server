// Opt-in command only; fixed loopback replica set, randomized disposable QA DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { PricingStore, type WritePoint } from '../../src/services/pricing/store';
import { COLLECTIONS, setupPricing } from '../../src/services/pricing/setup';
import { emptyConfiguration, PricingError, type Actor } from '../../src/services/pricing/domain';
import { createApp } from '../../src/app';
import { readConfig } from '../../src/config';
import { hasAdminProtocol, loadAdminProtocol } from './admin-protocol';

const localTest = process.env.PRICING_LOCAL_INTEGRATION === '1' ? test : test.skip;
const actor: Actor = { actor_type: 'admin', actor_id: '6a0000000000000000000001' };
const other: Actor = { actor_type: 'admin', actor_id: '6a0000000000000000000002' };
const move = { volume_cf: '725', mileage: '1240', pickup_state: 'FL', pickup_zip: '00501', delivery_state: 'MT', delivery_zip: '59715' };
const command = (expected = 0) => ({ operation_id: randomUUID(), expected_activation_version: expected, change_note: 'Synthetic local QA' });
const isCode = (code: string) => (e: unknown) => e instanceof PricingError && e.code === code;
async function isolated(run: (db: Db, store: PricingStore) => Promise<void>) {
  const name = `vantage_pricing_qa_${randomUUID().replaceAll('-', '')}`;
  const client = new MongoClient('mongodb://127.0.0.1:27018/?replicaSet=pricing-local', { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
    assert.equal((await client.db('admin').command({ hello: 1 })).setName, 'pricing-local');
    const db = client.db(name); await run(db, new PricingStore(async () => db));
  } finally {
    assert.match(name, /^vantage_pricing_qa_[a-f0-9]{32}$/);
    await client.db(name).dropDatabase().catch(() => undefined);
    await client.close();
  }
}
async function completeDraft(store: PricingStore, rate = '1.0000', base: string | null = null) {
  const draft = await store.createDraft({ base_revision_id: base, operation_id: randomUUID() }, actor);
  const config = emptyConfiguration();
  for (const row of Object.values(config.base_rates)) for (const key of Object.keys(row)) row[key as keyof typeof row] = rate;
  return store.saveDraft(draft._id, { expected_draft_version: draft.draft_version, configuration: config }, actor);
}
async function publish(store: PricingStore, draft: any, expected = 0) {
  const preview = await store.previewDraft(draft._id, { expected_draft_version: draft.draft_version, inputs: [] });
  const body = { ...command(expected), expected_draft_version: draft.draft_version, ...(preview.warnings.length ? { preview_inputs: [], acknowledged_warning_hash: preview.warning_hash } : {}) };
  return { body, result: await store.command('publish', body, actor, draft._id) };
}
async function snapshot(db: Db) {
  return JSON.stringify(await Promise.all(Object.values(COLLECTIONS).map(name => db.collection(name).find().sort({ _id: 1 }).toArray())));
}

localTest('local replica: setup report has no writes; apply owns exactly four validated/indexed collections disabled/null', async () => isolated(async (db, store) => {
  const report = await setupPricing(db);
  assert.equal(report.applied, false); assert.equal((await db.listCollections().toArray()).length, 0);
  await setupPricing(db, true);
  assert.deepEqual((await db.listCollections().toArray()).map(c => c.name).sort(), Object.values(COLLECTIONS).sort());
  const control = (await store.configuration()).control;
  assert.equal(control.active_revision_id, null); assert.equal(control.calculation_enabled, false); assert.equal(control.activation_version, 0);
  const info = await db.listCollections({}, { nameOnly: false }).toArray();
  assert.ok(info.every(c => c.options?.validator && c.options?.validationAction === 'error'));
  assert.ok((await db.collection(COLLECTIONS.changes).indexes()).some(i => i.name === 'change_activation' && i.unique));
  await assert.rejects(db.collection(COLLECTIONS.control).updateOne({ _id: 'transportation' } as any, { $set: { unexpected: true } }), (e: any) => e.code === 121);
  await assert.rejects(store.calculate(move), isCode('PRICING_NOT_CONFIGURED'));
}));

localTest('local replica: abort after every publication write leaves byte-identical state', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const draft = await completeDraft(store);
  const before = await snapshot(db);
  for (const point of ['revision', 'control', 'draft', 'change'] as WritePoint[]) {
    const faulty = new PricingStore(async () => db, { afterWrite: async p => { if (p === point) throw new Error(`QA intentional ${point} abort`); } });
    await assert.rejects(faulty.command('publish', { ...command(), expected_draft_version: 2 }, actor, draft._id), new RegExp(`QA intentional ${point} abort`));
    assert.equal(await snapshot(db), before, point);
  }
}));

localTest('local replica: draft CAS races and edit during publication cannot overwrite committed edits', async () => isolated(async (db, store) => {
  await setupPricing(db, true); const draft = await completeDraft(store);
  const saves = await Promise.allSettled([1, 2].map(() => store.saveDraft(draft._id, { expected_draft_version: 2, configuration: draft.configuration }, actor)));
  assert.equal(saves.filter(v => v.status === 'fulfilled').length, 1);
  const saved = await store.getDraft(draft._id);
  let arrived!: () => void, release!: () => void;
  const atRevision = new Promise<void>(r => { arrived = r; }); const barrier = new Promise<void>(r => { release = r; });
  const paused = new PricingStore(async () => db, { afterWrite: async p => { if (p === 'revision') { arrived(); await barrier; } } });
  const publishing = paused.command('publish', { ...command(), expected_draft_version: saved.draft_version }, actor, draft._id);
  await atRevision;
  const changed = await store.saveDraft(draft._id, { expected_draft_version: saved.draft_version, configuration: saved.configuration }, actor);
  release();
  await assert.rejects(publishing, isCode('DRAFT_VERSION_CONFLICT'));
  assert.equal((await store.getDraft(draft._id)).draft_version, changed.draft_version);
  assert.equal(await db.collection(COLLECTIONS.revisions).countDocuments(), 0);
  assert.equal(await db.collection(COLLECTIONS.changes).countDocuments(), 0);
}));

localTest('local replica: competing publications and disable/publication races have one winner', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const drafts = await Promise.all([completeDraft(store), completeDraft(store)]);
  const outcomes = await Promise.allSettled(drafts.map(d => store.command('publish', { ...command(), expected_draft_version: 2 }, actor, d._id)));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(await db.collection(COLLECTIONS.revisions).countDocuments(), 1);
  assert.equal(await db.collection(COLLECTIONS.changes).countDocuments(), 1);
  const next = await completeDraft(store);
  const racing = await Promise.allSettled([
    store.command('publish', { ...command(1), expected_draft_version: 2 }, actor, next._id),
    store.command('set_enabled', { ...command(1), calculation_enabled: false }, actor),
  ]);
  assert.equal(racing.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal((await store.configuration()).control.activation_version, 2);
  assert.equal(await db.collection(COLLECTIONS.changes).countDocuments(), 2);
}));

localTest('local replica: lost success response retry is stable before stale CAS; actor/body key reuse conflicts', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const create = { base_revision_id: null, operation_id: randomUUID() };
  const created = await store.createDraft(create, actor);
  assert.equal((await store.createDraft(create, actor))._id, created._id);
  await assert.rejects(store.createDraft(create, other), isCode('IDEMPOTENCY_CONFLICT'));
  const draft = await completeDraft(store); const { body, result } = await publish(store, draft);
  assert.deepEqual(await store.command('publish', body, actor, draft._id), result);
  await assert.rejects(store.command('publish', { ...body, change_note: 'changed' }, actor, draft._id), isCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(store.command('publish', body, other, draft._id), isCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(store.command('publish', { ...body, operation_id: randomUUID(), expected_activation_version: 1 }, actor, draft._id), isCode('DRAFT_ALREADY_PUBLISHED'));
  assert.equal(await db.collection(COLLECTIONS.revisions).countDocuments(), 1);
  assert.equal(await db.collection(COLLECTIONS.changes).countDocuments(), 1);
}));

localTest('local replica: warning acknowledgement binds draft and control; rollback/enable advance versions and preserve history', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const first = await completeDraft(store); const a = await publish(store, first);
  await assert.rejects(store.calculate(move), isCode('PRICING_DISABLED'));
  await store.command('set_enabled', { ...command(1), calculation_enabled: true }, actor);
  const changed = await completeDraft(store, '2.0000', a.result.revision_id);
  const preview = await store.previewDraft(changed._id, { expected_draft_version: 2, inputs: [] });
  assert.ok(preview.warnings.length);
  const body = { ...command(2), expected_draft_version: 2, preview_inputs: [], acknowledged_warning_hash: preview.warning_hash };
  await store.command('set_enabled', { ...command(2), calculation_enabled: true }, actor);
  await assert.rejects(store.command('publish', { ...body, expected_activation_version: 3 }, actor, changed._id), isCode('PREVIEW_ACKNOWLEDGEMENT_STALE'));
  const b = await publish(store, changed, 3);
  assert.equal((await store.calculate(move)).transportation_price, '1450.00');
  const restore = { ...command(4), revision_id: a.result.revision_id };
  const restored = await store.command('activate', restore, actor);
  assert.equal(restored.activation_version, 5); assert.equal(restored.calculation_enabled, true);
  assert.deepEqual(await store.command('activate', restore, actor), restored);
  assert.equal((await store.calculate(move)).transportation_price, '725.00');
  assert.equal(await db.collection(COLLECTIONS.revisions).countDocuments(), 2);
  assert.equal((await store.getRevision(b.result.revision_id)).configuration.base_rates.MI_751_1250.CF_501_1000, '2.0000');
}));

localTest('local replica: calculation concurrent publish is coherent; corrupted pointer/hash fail closed', async () => isolated(async (db, store) => {
  await setupPricing(db, true); const first = await completeDraft(store); const a = await publish(store, first);
  await store.command('set_enabled', { ...command(1), calculation_enabled: true }, actor);
  const draft = await completeDraft(store, '2.0000');
  const reading = Promise.all(Array.from({ length: 20 }, () => store.calculate(move)));
  const b = await publish(store, draft, 2);
  for (const result of await reading) {
    assert.ok(result.revision_id === a.result.revision_id || result.revision_id === b.result.revision_id);
    assert.equal(result.transportation_price, result.revision_id === a.result.revision_id ? '725.00' : '1450.00');
    assert.equal(result.activation_version, result.revision_id === a.result.revision_id ? 2 : 3);
  }
  await db.collection(COLLECTIONS.revisions).updateOne({ _id: new ObjectId(b.result.revision_id) }, { $set: { configuration_hash: 'corrupt' } });
  await assert.rejects(store.calculate(move), isCode('CONFIGURATION_CORRUPT'));
  await db.collection(COLLECTIONS.control).updateOne({ _id: 'transportation' } as any, { $set: { active_revision_id: new ObjectId() } });
  await assert.rejects(store.calculate(move), isCode('CONFIGURATION_CORRUPT'));
}));

localTest('local signed HTTP: real Admin signer edits/publishes disabled, separately enables, extension calculates and disable denies', { skip: !hasAdminProtocol }, async () => isolated(async (db, store) => {
  const { pricingHeaders } = await loadAdminProtocol();
  await setupPricing(db, true);
  const secret = 'local-http-qa-only-key-000000000000000000000000';
  const app = createApp({ config: readConfig({ TEST_MODE: 'true', LOG_LEVEL: 'silent' }), pricingStore: store, pricingAuth: {
    operationsAdminSigningSecret: secret, mainServerAuthBaseUrl: 'https://authority.example.invalid',
    fetch: (async (_url, init) => {
      assert.deepEqual(init?.headers, { authorization: 'Bearer synthetic-sales-token' });
      return new Response(JSON.stringify({ ok: true, data: { user: { id: '6a0000000000000000000002', email: 'synthetic@example.invalid', roles: ['sales'] } } }));
    }) as typeof fetch,
  } });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const request = async (method: string, path: string, value?: unknown, extension = false) => {
    const target = `/api/v1/pricing${path}`, body = value === undefined ? '' : JSON.stringify(value);
    const headers = extension ? { authorization: 'Bearer synthetic-sales-token', 'content-type': 'application/json' } : pricingHeaders({ actorId: actor.actor_id, method, target, body, secret, timestamp: String(Date.now()), requestId: randomUUID() });
    const response = await fetch(origin + target, { method, headers, body: body || undefined });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() as any };
  };
  try {
    assert.equal((await fetch(origin + '/api/v1/pricing/configuration')).status, 401);
    assert.equal((await request('GET', '/configuration', undefined, true)).status, 403);
    const created = await request('POST', '/drafts', { base_revision_id: null, operation_id: randomUUID() });
    assert.equal(created.status, 200); const draft = created.body.data;
    for (const row of Object.values(draft.configuration.base_rates) as any[]) for (const key of Object.keys(row)) row[key] = '3.2000';
    const saved = await request('PUT', `/drafts/${draft._id}`, { expected_draft_version: 1, configuration: draft.configuration });
    assert.equal(saved.status, 200);
    const preview = await request('POST', `/drafts/${draft._id}/preview`, { expected_draft_version: 2, inputs: [move] });
    assert.equal(preview.status, 200); assert.equal(preview.body.data.results[0].data.production, false);
    const publishBody = { ...command(), expected_draft_version: 2 };
    const published = await request('POST', `/drafts/${draft._id}/publish`, publishBody);
    assert.equal(published.status, 200); assert.equal(published.body.data.calculation_enabled, false);
    assert.deepEqual((await request('POST', `/drafts/${draft._id}/publish`, publishBody)).body, published.body);
    assert.equal((await request('POST', '/calculate', move, true)).body.error.code, 'PRICING_DISABLED');
    assert.equal((await request('POST', '/enabled', { ...command(1), calculation_enabled: true })).status, 200);
    const priced = await request('POST', '/calculate', move, true);
    assert.equal(priced.status, 200); assert.equal(priced.body.data.transportation_price, '2320.00');
    assert.equal(priced.body.data.revision_id, published.body.data.revision_id);
    assert.equal((await request('POST', '/enabled', { ...command(2), calculation_enabled: false })).status, 200);
    assert.equal((await request('POST', '/calculate', move, true)).body.error.code, 'PRICING_DISABLED');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}));

localTest('local replica: assigned group IDs survive copy/rename and validators reject rates above policy maximum', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const draft = await completeDraft(store);
  const configuration = structuredClone(draft.configuration);
  configuration.surcharge_groups.push({ group_id: null, name: 'Synthetic group', active: true, states: ['MT'], rates: { ...configuration.base_rates.MI_0_100 } });
  const saved = await store.saveDraft(draft._id, { expected_draft_version: 2, configuration }, actor);
  const assigned = saved.configuration.surcharge_groups[0].group_id;
  assert.match(assigned, /^[a-f0-9-]{36}$/);
  const fabricated = structuredClone(saved.configuration);
  fabricated.surcharge_groups[0].group_id = randomUUID();
  await assert.rejects(store.saveDraft(draft._id, { expected_draft_version: 3, configuration: fabricated }, actor), isCode('CONFIGURATION_INVALID'));
  await assert.rejects(db.collection(COLLECTIONS.drafts).updateOne({ _id: new ObjectId(draft._id) }, { $set: { 'configuration.base_rates.MI_0_100.MIN_300': '1000.0001' } }), (e: any) => e.code === 121);
  const published = await publish(store, saved);
  const copied = await store.createDraft({ base_revision_id: published.result.revision_id, operation_id: randomUUID() }, actor);
  copied.configuration.surcharge_groups[0].name = 'Renamed synthetic group';
  const renamed = await store.saveDraft(copied._id, { expected_draft_version: 1, configuration: copied.configuration }, actor);
  assert.equal(renamed.configuration.surcharge_groups[0].group_id, assigned);
  assert.equal((await store.getRevision(published.result.revision_id)).configuration.surcharge_groups[0].name, 'Synthetic group');
}));

localTest('local replica: revision cursor pages tied timestamps without duplicates or snapshot payloads', async () => isolated(async (db, store) => {
  await setupPricing(db, true);
  const expected: string[] = [];
  for (let index = 0; index < 3; index++) {
    const draft = await completeDraft(store);
    expected.push((await publish(store, draft, index)).result.revision_id);
  }
  // Force date ties to exercise the ObjectId tiebreaker, independently of clock resolution.
  await db.collection(COLLECTIONS.revisions).updateMany({}, { $set: { created_at: new Date('2026-10-25T00:00:00.000Z') } });
  const found: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await store.revisions({ limit: '1', ...(cursor ? { cursor } : {}) });
    assert.equal(page.items.length, 1);
    assert.equal(Object.hasOwn(page.items[0], 'configuration'), false);
    found.push(page.items[0]._id);
    cursor = page.next_cursor;
  } while (cursor);
  assert.deepEqual(found, expected.sort().reverse());
  await assert.rejects(store.revisions({ cursor: 'malformed', limit: '1' }), isCode('INVALID_INPUT'));
}));




