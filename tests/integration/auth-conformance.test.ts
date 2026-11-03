import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Request } from 'express';
import { hasAdminProtocol, loadAdminProtocol, referenceHeaders as pricingHeaders } from './admin-protocol';
import { authenticate, extensionActor, verifyAdmin } from '../../src/services/pricing/auth';
import { PricingError } from '../../src/services/pricing/domain';

const secret = 'public-qa-only-key-000000000000000000000000';
const now = 1792962000000;
const body = Buffer.from('{"operation_id":"87a9d6aa-0772-464a-8966-d69403002dc1"}');
function signed(overrides: Record<string, string> = {}, method = 'POST', target = '/api/v1/pricing/enabled', timestamp = String(now)): Request {
  const headers = { ...pricingHeaders({ actorId: '6a0000000000000000000001', method, target, timestamp, requestId: randomUUID(), secret, body: body.toString() }), ...overrides };
  return { method, originalUrl: target, headers, rawHeaders: Object.entries(headers).flatMap(([k, v]) => [k, v]) } as unknown as Request;
}
const code = (expected: string) => (error: unknown) => error instanceof PricingError && error.code === expected;
function authority(user: unknown = { id: '6a0000000000000000000001', email: 'synthetic@example.invalid', roles: ['sales'] }) {
  return new Response(JSON.stringify({ ok: true, data: { user } }), { status: 200 });
}

test('Admin actual proxy signer interoperates with Operations verifier; bytes/method/target/actor/role tampering fails', { skip: !hasAdminProtocol }, async () => {
  const actual = await loadAdminProtocol();
  const actualHeaders = actual.pricingHeaders({actorId:'6a0000000000000000000001',method:'POST',target:'/api/v1/pricing/enabled',timestamp:String(now),requestId:randomUUID(),secret,body:body.toString()});
  assert.equal(verifyAdmin({method:'POST',originalUrl:'/api/v1/pricing/enabled',headers:actualHeaders,rawHeaders:Object.entries(actualHeaders).flat()} as unknown as Request,body,secret,now).actor_type,'admin');
  assert.equal(verifyAdmin(signed(), body, secret, now).actor_type, 'admin');
  for (const key of ['x-vantage-operations-actor-id', 'x-vantage-operations-role', 'x-vantage-operations-timestamp', 'x-vantage-operations-request-id', 'x-vantage-operations-signature']) {
    assert.throws(() => verifyAdmin(signed({ [key]: 'tampered' }), body, secret, now), code('UNAUTHENTICATED'));
  }
  assert.throws(() => verifyAdmin(signed(), Buffer.concat([body, Buffer.from(' ')]), secret, now), code('UNAUTHENTICATED'));
  const method = signed(); method.method = 'PUT';
  assert.throws(() => verifyAdmin(method, body, secret, now), code('UNAUTHENTICATED'));
  const target = signed(); target.originalUrl = '/api/v1/pricing/activate';
  assert.throws(() => verifyAdmin(target, body, secret, now), code('UNAUTHENTICATED'));
  assert.throws(() => verifyAdmin(signed({ authorization: 'Bearer ambiguous' }), body, secret, now), code('UNAUTHENTICATED'));
  const duplicate = signed(); duplicate.rawHeaders.push('X-Vantage-Operations-Role', 'owner');
  assert.throws(() => verifyAdmin(duplicate, body, secret, now), code('UNAUTHENTICATED'));
  assert.throws(() => verifyAdmin(signed(), body, undefined, now), code('AUTH_UNAVAILABLE'));
});

test('Admin assertion deadline boundaries, canonical target and old registry assertion fail closed', () => {
  assert.equal(verifyAdmin(signed({}, 'POST', '/api/v1/pricing/enabled', String(now - 30000)), body, secret, now).actor_type, 'admin');
  assert.equal(verifyAdmin(signed({}, 'POST', '/api/v1/pricing/enabled', String(now + 5000)), body, secret, now).actor_type, 'admin');
  for (const stamp of [now - 30001, now + 5001]) assert.throws(() => verifyAdmin(signed({}, 'POST', '/api/v1/pricing/enabled', String(stamp)), body, secret, now), code('UNAUTHENTICATED'));
  for (const path of ['/api/v1/pricing/enabled/', '/api/v1/pricing/../pricing/enabled', '/api/v1/pricing/enabled?limit=1']) assert.throws(() => verifyAdmin(signed({}, 'POST', path), body, secret, now), code('UNAUTHENTICATED'));
  const query = signed({}, 'GET', '/api/v1/pricing/revisions?limit=20&cursor=abc');
  assert.throws(() => verifyAdmin(query, body, secret, now), code('UNAUTHENTICATED'));
  const legacy = createHmac('sha256', secret).update(['6a0000000000000000000001', 'synthetic@example.invalid', 'owner', String(now), randomUUID(), 'POST', '/api/v1/pricing/enabled'].join('\n')).digest('hex');
  assert.throws(() => verifyAdmin(signed({ 'x-vantage-operations-signature': legacy }), body, secret, now), code('UNAUTHENTICATED'));
});

test('Extension authority forwards only bearer to fixed HTTPS path each time, no positive cache', async () => {
  let calls = 0;
  const fetcher = (async (url: URL | RequestInfo, options?: RequestInit) => {
    calls++; assert.equal(String(url), 'https://authority.example.invalid/api/v1/extension/auth/me');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.credentials, 'omit'); assert.equal(options?.cache, 'no-store');
    assert.deepEqual(options?.headers, { authorization: 'Bearer synthetic-token' });
    return authority();
  }) as typeof fetch;
  assert.deepEqual(await extensionActor('synthetic-token', 'https://authority.example.invalid', fetcher), { actor_type: 'extension_user', actor_id: '6a0000000000000000000001', roles: ['sales'] });
  await extensionActor('synthetic-token', 'https://authority.example.invalid', fetcher); assert.equal(calls, 2);
  for (const url of ['http://authority.example.invalid', 'https://user:pass@authority.example.invalid', 'https://authority.example.invalid/path', 'https://authority.example.invalid/?url=evil']) await assert.rejects(extensionActor('x', url, fetcher), code('AUTH_UNAVAILABLE'));
});

test('Extension authority malformed/bounded response, 401 vs outage and changing authority decisions fail closed', async () => {
  const run = (response: Response) => extensionActor('synthetic-token', 'https://authority.example.invalid', (async () => response) as typeof fetch);
  await assert.rejects(run(new Response('private upstream error', { status: 401 })), code('UNAUTHENTICATED'));
  for (const response of [new Response('error', { status: 500 }), new Response('redirect', { status: 302 }), new Response('{}'), new Response(' '.repeat(16385)), authority({ id: 'bad', email: 'synthetic@example.invalid', roles: ['sales'] }), authority({ id: '6a0000000000000000000001', email: 'bad', roles: ['sales'] }), authority({ id: '6a0000000000000000000001', email: 'synthetic@example.invalid', roles: ['sales', 'sales'] }), authority({ id: '6a0000000000000000000001', email: 'synthetic@example.invalid', roles: ['manager'] })]) await assert.rejects(run(response), code('AUTH_UNAVAILABLE'));
  let active = true;
  const changing = (async () => active ? authority() : new Response('{}', { status: 401 })) as typeof fetch;
  await extensionActor('same-token', 'https://authority.example.invalid', changing); active = false;
  await assert.rejects(extensionActor('same-token', 'https://authority.example.invalid', changing), code('UNAUTHENTICATED'));
});

test('Extension role union, ambiguous credentials and authority deadline are enforced', async () => {
  const req = { headers: { authorization: 'Bearer synthetic-token' }, rawHeaders: ['Authorization', 'Bearer synthetic-token'] } as unknown as Request;
  const options = { mainServerAuthBaseUrl: 'https://authority.example.invalid', fetch: (async () => authority({ id: '6a0000000000000000000001', email: 'synthetic@example.invalid', roles: ['sales', 'customer_service'] })) as typeof fetch };
  assert.equal((await authenticate(req, Buffer.alloc(0), options)).actor_type, 'extension_user');
  await assert.rejects(authenticate(req, Buffer.alloc(0), { ...options, fetch: (async () => authority({ id: '6a0000000000000000000001', email: 'synthetic@example.invalid', roles: ['customer_service'] })) as typeof fetch }), code('FORBIDDEN'));
  for (const token of ['Bearer x, Bearer y', 'Bearer ' + 'x'.repeat(8192), 'Basic abc']) await assert.rejects(authenticate({ headers: { authorization: token }, rawHeaders: ['Authorization', token] } as Request, Buffer.alloc(0), options), code('UNAUTHENTICATED'));
  const duplicate = { ...req, rawHeaders: [...req.rawHeaders, 'authorization', 'Bearer other'] } as unknown as Request;
  await assert.rejects(authenticate(duplicate, Buffer.alloc(0), options), code('UNAUTHENTICATED'));
  const started = Date.now();
  const blocked = (async (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }))) as typeof fetch;
  await assert.rejects(extensionActor('x', 'https://authority.example.invalid', blocked), code('AUTH_UNAVAILABLE'));
  assert.ok(Date.now() - started >= 2900 && Date.now() - started < 4500);
});


