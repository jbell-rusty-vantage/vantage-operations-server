import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, emptyConfiguration, normalizeInputs, validateConfiguration, PricingError, type Configuration, type Inputs } from '../../src/services/pricing/domain';

const input = (volume_cf = '725', mileage = '1240'): Inputs => normalizeInputs({ volume_cf, mileage, pickup_state: 'FL', pickup_zip: '00501', delivery_state: 'MT', delivery_zip: '59715-1234' });
const context = { revision_id: '6a0000000000000000000001', activation_version: 3 };
const mileageCases = [['0', 'MI_0_100'], ['100', 'MI_0_100'], ['300', 'MI_101_300'], ['750', 'MI_301_750'], ['1250', 'MI_751_1250'], ['1800', 'MI_1251_1800'], ['2500', 'MI_1801_2500'], ['3000', 'MI_2501_3000'], ['100000', 'MI_3000_PLUS']] as const;
const volumeCases = [['300', 'MIN_300'], ['500', 'CF_301_500'], ['1000', 'CF_501_1000'], ['1500', 'CF_1001_1500'], ['2000', 'CF_1501_2000'], ['3000', 'CF_2001_3000'], ['100000', 'CF_3001_PLUS']] as const;
function fixture(): Configuration {
  const config = emptyConfiguration();
  for (const row of Object.values(config.base_rates)) for (const key of Object.keys(row)) row[key as keyof typeof row] = '1.0000';
  return config;
}
function error(code: string) { return (e: unknown) => e instanceof PricingError && e.code === code; }

test('independent acceptance: every mileage and volume boundary retains four-place distinctions', () => {
  const config = fixture();
  for (let index = 1; index < mileageCases.length - 1; index++) {
    const [edge, expected] = mileageCases[index]!;
    const units = BigInt(edge) * 10000n;
    const decimal = (v: bigint) => `${v / 10000n}.${String(v % 10000n).padStart(4, '0')}`;
    assert.equal(calculate(input('725', decimal(units - 1n)), config, context).mileage_band, expected);
    assert.equal(calculate(input('725', edge), config, context).mileage_band, expected);
    assert.equal(calculate(input('725', decimal(units + 1n)), config, context).mileage_band, mileageCases[index + 1]![1]);
  }
  for (let index = 0; index < volumeCases.length - 1; index++) {
    const [edge, expected] = volumeCases[index]!;
    const value = Number(edge);
    assert.equal(calculate(input((value - 0.0001).toFixed(4)), config, context).volume_tier, expected);
    assert.equal(calculate(input(edge), config, context).volume_tier, expected);
    assert.equal(calculate(input((value + 0.0001).toFixed(4)), config, context).volume_tier, volumeCases[index + 1]![1]);
  }
  for (const cf of ['0', '75', '299.9999', '300']) {
    const result = calculate(input(cf, '0'), config, context);
    assert.equal(result.billable_cf, '300'); assert.equal(result.actual_cf, cf);
  }
});

test('independent acceptance: all 56 distinct matrix positions are observable', () => {
  const config = fixture();
  const rows = mileageCases.slice(1);
  rows.forEach(([, key], row) => volumeCases.forEach(([, tier], column) => { config.base_rates[key][tier] = `${row * 7 + column}.0000`; }));
  rows.forEach(([miles, key], row) => volumeCases.forEach(([cf, tier], column) => {
    const result = calculate(input(cf, miles), config, context);
    assert.equal(result.mileage_band, key); assert.equal(result.volume_tier, tier);
    assert.equal(result.base_rate_per_cf, `${row * 7 + column}.0000`);
  }));
});

test('independent acceptance: illustrative source examples, explicit zero pickup and missing pickup never fall through', () => {
  const config = fixture();
  const rates = Object.fromEntries(Object.keys(config.base_rates.MI_0_100).map(k => [k, '3.0000'])) as Configuration['base_rates']['MI_0_100'];
  config.surcharge_groups.push({ group_id: 'c581a221-d1f8-49cd-9872-7fcc06ae8072', name: 'Synthetic MT', active: true, states: ['MT'], rates });
  config.base_rates.MI_1801_2500.MIN_300 = '4.0000';
  assert.equal(calculate({ ...input('75', '2429'), pickup_state: 'MT' }, config, context).transportation_price, '2100.00');
  rates.CF_501_1000 = '0.5000'; config.base_rates.MI_751_1250.CF_501_1000 = '3.2000';
  assert.equal(calculate(input(), config, context).transportation_price, '2682.50');
  const pickupRates: Configuration['base_rates']['MI_0_100'] = { ...rates, CF_501_1000: '0.0000' };
  config.surcharge_groups.push({ group_id: 'c581a221-d1f8-49cd-9872-7fcc06ae8073', name: 'Synthetic FL', active: true, states: ['FL'], rates: pickupRates });
  const zero = calculate(input(), config, context);
  assert.equal(zero.surcharge_source, 'PICKUP'); assert.equal(zero.surcharge_rate_per_cf, '0.0000');
  pickupRates.CF_501_1000 = null;
  assert.throws(() => calculate(input(), config, context), error('STATE_SURCHARGE_NOT_CONFIGURED'));
  config.surcharge_groups[1]!.active = false;
  assert.equal(calculate(input(), config, context).surcharge_source, 'DELIVERY');
  config.surcharge_groups[0]!.active = false;
  assert.equal(calculate(input(), config, context).surcharge_source, 'NONE');
});

test('independent acceptance: exact cent rounding, maximum product, strict wire normalization', () => {
  const config = fixture();
  config.base_rates.MI_751_1250.CF_301_500 = '0.0100';
  for (const [cf, amount] of [['300.4999', '3.00'], ['300.5', '3.01'], ['300.5001', '3.01']]) assert.equal(calculate(input(cf), config, context).transportation_price, amount);
  config.base_rates.MI_3000_PLUS.CF_3001_PLUS = '1000.0000';
  assert.equal(calculate(input('100000', '100000'), config, context).transportation_price, '100000000.00');
  assert.equal(input().pickup_zip, '00501');
  for (const bad of [100, true, '', '-1', '+1', '1e2', '1,000', '00', '1.00001', '100000.0001', 'Infinity']) assert.throws(() => normalizeInputs({ ...input(), volume_cf: bad }), error('INVALID_INPUT'));
  assert.throws(() => normalizeInputs({ ...input(), unexpected: true }), error('INVALID_INPUT'));
  assert.throws(() => validateConfiguration({ ...config, surcharge_groups: [{ group_id: null, name: 'A', active: true, states: ['MT'], rates: config.base_rates.MI_0_100 }, { group_id: null, name: 'B', active: true, states: ['MT'], rates: config.base_rates.MI_0_100 }] }, new Set()), error('CONFIGURATION_INVALID'));
});

test('independent acceptance: missing base differs from explicit zero and same-state surcharge applies once', () => {
  const config = fixture();
  config.base_rates.MI_751_1250.CF_501_1000 = null;
  assert.throws(() => calculate(input(), config, context), error('MILEAGE_RATE_NOT_CONFIGURED'));
  config.base_rates.MI_751_1250.CF_501_1000 = '0.0000';
  assert.equal(calculate(input(), config, context).transportation_price, '0.00');
  config.surcharge_groups.push({ group_id: 'c581a221-d1f8-49cd-9872-7fcc06ae8072', name: 'Synthetic shared state', active: true, states: ['FL'], rates: { ...config.base_rates.MI_0_100 } });
  const result = calculate({ ...input(), delivery_state: 'FL' }, config, context);
  assert.equal(result.surcharge_source, 'PICKUP');
  assert.equal(result.transportation_price, '725.00');
  assert.equal(result.final_rate_per_cf, '1.0000');
});

