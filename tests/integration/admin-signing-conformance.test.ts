import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { hasAdminProtocol, loadAdminProtocol } from './admin-protocol';

// Public synthetic fixture only. This key is never deployment configuration.
export const fixture = {
  actorId: '6a0000000000000000000001', method: 'POST', target: '/api/v1/pricing/enabled',
  timestamp: '1792962000000', requestId: 'c581a221-d1f8-49cd-9872-7fcc06ae8072',
  secret: 'qa-only-operations-secret-0000000000000000',
  body: '{"calculation_enabled":true,"expected_activation_version":3,"operation_id":"87a9d6aa-0772-464a-8966-d69403002dc1","change_note":"Synthetic QA"}',
};
export function referenceSignature(value = fixture): string {
  const canonical = 'vantage-operations-admin-v1\ntransportation-pricing\n' +
    value.actorId + '\nowner\n' + value.timestamp + '\n' + value.requestId + '\n' +
    value.method + '\n' + value.target + '\n' + createHash('sha256').update(Buffer.from(value.body, 'utf8')).digest('hex');
  return createHmac('sha256', value.secret).update(Buffer.from(canonical, 'utf8')).digest('hex');
}

test('Admin signer matches independent operations assertion canonical bytes', { skip: !hasAdminProtocol }, async () => {
  const { pricingHeaders } = await loadAdminProtocol();
  assert.equal(pricingHeaders(fixture)['x-vantage-operations-signature'], referenceSignature());
  for (const change of [{ body: fixture.body + ' ' }, { method: 'PUT' }, { target: '/api/v1/pricing/activate' }, { timestamp: '1792962000001' }, { actorId: '6a0000000000000000000002' }]) {
    assert.notEqual(pricingHeaders({ ...fixture, ...change })['x-vantage-operations-signature'], referenceSignature());
  }
});

test('Admin exact route allowlist canonicalizes only allowed query keys and rejects aliases', { skip: !hasAdminProtocol }, async () => {
  const { pricingHeaders, pricingTarget } = await loadAdminProtocol();
  assert.equal(pricingTarget('GET', ['revisions'], new URLSearchParams('limit=20&cursor=abc')), '/api/v1/pricing/revisions?cursor=abc&limit=20');
  for (const path of [['configuration', ''], ['drafts', '..'], ['%63onfiguration'], ['configuration?limit=1'], ['configuration/']]) assert.throws(() => pricingTarget('GET', path, new URLSearchParams()));
  for (const query of ['limit=20&limit=30', 'unexpected=1', 'limit=0', 'limit=101', 'limit=020']) assert.throws(() => pricingTarget('GET', ['revisions'], new URLSearchParams(query)));
  assert.throws(() => pricingTarget('POST', ['enabled'], new URLSearchParams('limit=1')));
  assert.throws(() => pricingHeaders({ ...fixture, actorId: fixture.actorId + '\n' }));
});

