import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyConfiguration, MILEAGE_KEYS, VOLUME_KEYS } from './domain';
import { preview, warnings } from './preview';

const move={volume_cf:'500',mileage:'100',pickup_state:'FL',pickup_zip:'00501',delivery_state:'MT',delivery_zip:'59715'};
function complete() { const c=emptyConfiguration();for(const row of Object.values(c.base_rates)) for(const key of VOLUME_KEYS) row[key]='4.0000';return c; }
test('preview reports every whole-load downward edge and binds acknowledgement to draft, inputs and control',()=>{
  const config=complete();for(const m of MILEAGE_KEYS)config.base_rates[m].CF_501_1000='3.0000';
  const down=warnings(config,null);assert.equal(down.length,8);
  assert.ok(down.every(w=>w.code==='DOWNWARD_TOTAL_JUMP'&&w.old_price==='2000.00'&&w.new_price==='1500.00'));
  const draft={_id:'6a0000000000000000000001',draft_version:2,base_revision_id:null,configuration:config};
  const control={active_revision_id:null,activation_version:0};
  const p=preview(draft,control,null,[move]);assert.equal(p.complete,true);assert.equal(p.results[0]!.ok,true);
  assert.notEqual(preview({...draft,draft_version:3},control,null,[move]).warning_hash,p.warning_hash);
  assert.notEqual(preview(draft,{...control,activation_version:1},null,[move]).warning_hash,p.warning_hash);
  assert.notEqual(preview(draft,control,null,[]).warning_hash,p.warning_hash);
  assert.equal(preview(draft,control,null,[{...move,volume_cf:'500.0000'}]).warning_hash,p.warning_hash);
});
test('preview retains independent input failures and completeness findings without fabricating missing rates',()=>{
  const draft={_id:'6a0000000000000000000001',draft_version:1,base_revision_id:null,configuration:emptyConfiguration()};
  const report=preview(draft,{active_revision_id:null,activation_version:0},null,[move,{...move,mileage:25}]);
  assert.equal(report.complete,false);assert.equal(report.findings.length,56);
  assert.deepEqual(report.results.map(r=>r.ok?null:r.error.code),['MILEAGE_RATE_NOT_CONFIGURED','INVALID_INPUT']);
});
