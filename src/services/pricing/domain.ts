import { createHash, randomUUID } from 'node:crypto';

export const MILEAGE_KEYS = ['MI_0_100','MI_101_300','MI_301_750','MI_751_1250','MI_1251_1800','MI_1801_2500','MI_2501_3000','MI_3000_PLUS'] as const;
export const VOLUME_KEYS = ['MIN_300','CF_301_500','CF_501_1000','CF_1001_1500','CF_1501_2000','CF_2001_3000','CF_3001_PLUS'] as const;
export const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export type MileageKey = typeof MILEAGE_KEYS[number];
export type VolumeKey = typeof VOLUME_KEYS[number];
export type Rates = Record<VolumeKey, string | null>;
export interface Group { group_id: string; name: string; active: boolean; states: string[]; rates: Rates }
export interface Configuration { currency: 'USD'; base_rates: Record<MileageKey, Rates>; surcharge_groups: Group[] }
export interface Inputs { volume_cf: string; mileage: string; pickup_state: string; pickup_zip: string; delivery_state: string; delivery_zip: string }
export interface Actor { actor_type: 'admin' | 'extension_user'; actor_id: string; roles?: string[] }
export interface Finding { code: string; path: string; message: string }
export class PricingError extends Error {
  constructor(public status: number, public code: string, message = code, public fields?: Finding[]) { super(message); }
}
export function fail(status: number, code: string, message?: string): never { throw new PricingError(status, code, message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_INPUT');
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  if (required.some(k => !Object.hasOwn(value,k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail(400,'INVALID_INPUT');
}
export function decimal(value: unknown, max = 100000, path = ''): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/.test(value.trim())) {
    throw new PricingError(400,'INVALID_INPUT','Check the decimal inputs.',[{code:'DECIMAL_FORMAT',path,message:'Use a nonnegative decimal string with at most four decimal places.'}]);
  }
  const clean = value.trim();
  if (units(clean) > BigInt(max)*10000n) fail(400,'INVALID_INPUT');
  return canonicalDecimal(clean);
}
export function units(value: string): bigint { const [whole, frac = ''] = value.split('.'); return BigInt(whole!)*10000n+BigInt(frac.padEnd(4,'0')); }
export function canonicalDecimal(value: string): string { return value.includes('.') ? value.replace(/0+$/,'').replace(/\.$/,'') : value; }
export function rateString(value: bigint): string { return `${value/10000n}.${(value%10000n).toString().padStart(4,'0')}`; }
export function money(volume: bigint, rate: bigint): string { const cents = (volume*rate+500000n)/1000000n; return `${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`; }
export function normalizeInputs(value: unknown): Inputs {
  const v = object(value); exact(v,['volume_cf','mileage','pickup_state','pickup_zip','delivery_state','delivery_zip']);
  const result = { volume_cf: decimal(v.volume_cf,100000,'volume_cf'), mileage: decimal(v.mileage,100000,'mileage') } as Inputs;
  for (const side of ['pickup','delivery'] as const) {
    const state = v[`${side}_state`]; const zip = v[`${side}_zip`];
    if (typeof state !== 'string' || !STATES.includes(state.trim().toUpperCase()) || typeof zip !== 'string' || !/^\d{5}(-\d{4})?$/.test(zip.trim())) fail(400,'INVALID_INPUT');
    result[`${side}_state`] = state.trim().toUpperCase(); result[`${side}_zip`] = zip.trim();
  }
  return result;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a<b?-1:a>b?1:0).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function emptyConfiguration(): Configuration {
  return {currency:'USD',base_rates:Object.fromEntries(MILEAGE_KEYS.map(k=>[k,Object.fromEntries(VOLUME_KEYS.map(t=>[t,null]))])) as Configuration['base_rates'],surcharge_groups:[]};
}
export function validateConfiguration(value: unknown, existingIds?: Set<string>): Configuration {
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > 256*1024) fail(422,'CONFIGURATION_INVALID');
    const v=object(value); exact(v,['currency','base_rates','surcharge_groups']);
    if (v.currency !== 'USD' || !Array.isArray(v.surcharge_groups) || v.surcharge_groups.length>100) fail(422,'CONFIGURATION_INVALID');
    const base=object(v.base_rates); exact(base,MILEAGE_KEYS);
    function rates(raw: unknown): Rates { const r=object(raw); exact(r,VOLUME_KEYS); return Object.fromEntries(VOLUME_KEYS.map(k=>[k,r[k]===null?null:rateString(units(decimal(r[k],1000)))])) as Rates; }
    const ids=new Set<string>(), names=new Set<string>(), activeStates=new Set<string>();
    const groups=v.surcharge_groups.map(raw=>{
      const g=object(raw); exact(g,['group_id','name','active','states','rates']);
      const id=g.group_id===null && existingIds ? randomUUID() : g.group_id;
      if (typeof id!=='string' || !UUID.test(id) || ids.has(id) || (existingIds && g.group_id!==null && !existingIds.has(id))) fail(422,'CONFIGURATION_INVALID');
      ids.add(id);
      if (typeof g.name!=='string' || !g.name.trim() || g.name.trim().length>80 || names.has(g.name.trim().toLowerCase()) || typeof g.active!=='boolean' || !Array.isArray(g.states)) fail(422,'CONFIGURATION_INVALID');
      names.add(g.name.trim().toLowerCase());
      const states=g.states.map(s=> { if(typeof s!=='string' || !STATES.includes(s.trim().toUpperCase())) fail(422,'CONFIGURATION_INVALID'); return s.trim().toUpperCase(); }).sort();
      if (new Set(states).size!==states.length) fail(422,'CONFIGURATION_INVALID');
      if(g.active) for(const s of states) { if(activeStates.has(s)) fail(422,'CONFIGURATION_INVALID','A state belongs to more than one active surcharge group.'); activeStates.add(s); }
      return {group_id:id,name:g.name.trim(),active:g.active,states,rates:rates(g.rates)};
    });
    return {currency:'USD',base_rates:Object.fromEntries(MILEAGE_KEYS.map(k=>[k,rates(base[k])])) as Configuration['base_rates'],surcharge_groups:groups};
  } catch(e) { if(e instanceof PricingError) throw new PricingError(422,'CONFIGURATION_INVALID',e.message,e.fields); throw e; }
}
export function findings(config: Configuration): Finding[] {
  const out: Finding[]=[];
  for(const m of MILEAGE_KEYS) for(const t of VOLUME_KEYS) if(config.base_rates[m][t]===null) out.push({code:'MISSING_RATE',path:`base_rates.${m}.${t}`,message:'Configure this base rate, including an intentional zero.'});
  for(const g of config.surcharge_groups) for(const t of VOLUME_KEYS) if(g.rates[t]===null) out.push({code:'MISSING_RATE',path:`surcharge_groups.${g.group_id}.rates.${t}`,message:'Configure all seven group rates, including inactive groups.'});
  return out;
}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string { if(typeof value!=='string'||!UUID.test(value)) fail(400,'INVALID_INPUT'); return value.toLowerCase(); }
export function id(value: unknown): string { if(typeof value!=='string'||!/^[0-9a-f]{24}$/.test(value)) fail(400,'INVALID_INPUT'); return value; }
export function version(value: unknown, minimum=0): number { if(typeof value!=='number'||!Number.isSafeInteger(value)||value<minimum) fail(400,'INVALID_INPUT'); return value; }
export function note(value: unknown): string { if(typeof value!=='string'||!value.trim()||value.trim().length>500) fail(400,'INVALID_INPUT'); return value.trim(); }
export function calculate(inputs: Inputs, config: Configuration, context: {revision_id: string|null; activation_version: number; calculated_at?: string}) {
  const actual=units(inputs.volume_cf), billable=actual<3000000n?3000000n:actual, miles=units(inputs.mileage);
  const mi=[100,300,750,1250,1800,2500,3000].findIndex(n=>miles<=BigInt(n)*10000n);
  const vi=[300,500,1000,1500,2000,3000].findIndex(n=>billable<=BigInt(n)*10000n);
  const mileage_band=MILEAGE_KEYS[mi<0?7:mi]!, volume_tier=VOLUME_KEYS[vi<0?6:vi]!;
  const base=config.base_rates[mileage_band]?.[volume_tier];
  if(base===null||base===undefined) fail(503,'MILEAGE_RATE_NOT_CONFIGURED');
  const pickup=config.surcharge_groups.filter(g=>g.active&&g.states.includes(inputs.pickup_state));
  const delivery=config.surcharge_groups.filter(g=>g.active&&g.states.includes(inputs.delivery_state));
  if(pickup.length>1||delivery.length>1) fail(503,'CONFIGURATION_CORRUPT');
  const group=pickup[0]??delivery[0]; const surcharge_source=pickup[0]?'PICKUP':group?'DELIVERY':'NONE';
  const surcharge=group?group.rates[volume_tier]:'0.0000';
  if(surcharge===null||surcharge===undefined) fail(503,'STATE_SURCHARGE_NOT_CONFIGURED');
  const rate=units(base)+units(surcharge);
  return {...context,schema_version:1,calculated_at:context.calculated_at??new Date().toISOString(),currency:'USD',actual_cf:inputs.volume_cf,billable_cf:canonicalDecimal(rateString(billable)),mileage:inputs.mileage,pickup_state:inputs.pickup_state,pickup_zip:inputs.pickup_zip,delivery_state:inputs.delivery_state,delivery_zip:inputs.delivery_zip,mileage_band,volume_tier,base_rate_per_cf:base,surcharge_source,surcharge_state:group?(surcharge_source==='PICKUP'?inputs.pickup_state:inputs.delivery_state):null,surcharge_group_id:group?.group_id??null,surcharge_group_name:group?.name??null,surcharge_rate_per_cf:surcharge,final_rate_per_cf:rateString(rate),transportation_price:money(billable,rate)};
}
