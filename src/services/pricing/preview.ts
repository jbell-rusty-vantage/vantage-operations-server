import { calculate, findings, hash, MILEAGE_KEYS, VOLUME_KEYS, units, money, normalizeInputs, type Configuration, PricingError } from './domain';

export interface PreviewDraft { _id: string; draft_version: number; base_revision_id: string|null; configuration: Configuration }
export interface PreviewControl { active_revision_id: string|null; activation_version: number }
interface Warning { code: string; mileage_band: string; volume_boundary: string; old_price: string|null; new_price: string; message: string }

// Compare each reachable surcharge policy, including no surcharge. The same
// whole-load discontinuity can appear under several state policies.
export function warnings(config: Configuration, previous: Configuration|null): Warning[] {
  const out: Warning[]=[];
  const states=[null,...new Set([...config.surcharge_groups,...(previous?.surcharge_groups??[])].filter(g=>g.active).flatMap(g=>g.states))];
  const boundaries=[300,500,1000,1500,2000,3000];
  for(const m of MILEAGE_KEYS) for(const state of states) {
    const group=state?config.surcharge_groups.find(g=>g.active&&g.states.includes(state)):undefined;
    const oldGroup=state?previous?.surcharge_groups.find(g=>g.active&&g.states.includes(state)):undefined;
    const rate=(c:Configuration|null,g:typeof group,t:typeof VOLUME_KEYS[number])=> {
      const base=c?.base_rates[m][t], surcharge=g?g.rates[t]:'0.0000';
      return base==null||surcharge==null?null:units(base)+units(surcharge);
    };
    for(let i=0;i<boundaries.length;i++) {
      const boundary=boundaries[i]!, left=BigInt(boundary)*10000n, right=left+1n;
      const r1=rate(config,group,VOLUME_KEYS[i]!),r2=rate(config,group,VOLUME_KEYS[i+1]!);
      if(r1!==null&&r2!==null&&right*r2<left*r1) out.push({code:'DOWNWARD_TOTAL_JUMP',mileage_band:m,volume_boundary:String(boundary),old_price:money(left,r1),new_price:money(right,r2),message:`${state??'No surcharge'}: ${boundary} CF to ${boundary}.0001 CF reduces the whole-load price.`});
      for(const [v,t] of [[left,VOLUME_KEYS[i]!],[right,VOLUME_KEYS[i+1]!]] as const) {
        const nextRate=rate(config,group,t), oldRate=rate(previous,oldGroup,t);
        if(previous&&nextRate!==null&&oldRate!==null&&nextRate!==oldRate) out.push({code:'PRICE_CHANGED',mileage_band:m,volume_boundary:`${v/10000n}${v%10000n?'.0001':''}`,old_price:money(v,oldRate),new_price:money(v,nextRate),message:`${state??'No surcharge'}: old/new transportation price at a tier edge.`});
      }
    }
  }
  return out.sort((a,b)=>[a.code,a.mileage_band,a.volume_boundary,a.message].join('|').localeCompare([b.code,b.mileage_band,b.volume_boundary,b.message].join('|')));
}
export function preview(draft: PreviewDraft, control: PreviewControl, active: Configuration|null, rawInputs: unknown[]) {
  const inputs=rawInputs.map(input=> { try { return normalizeInputs(input); } catch { return input; } });
  const configuration_hash=hash(draft.configuration), report=warnings(draft.configuration,active), missing=findings(draft.configuration);
  const warning_hash=hash({schema_version:1,draft_id:draft._id,draft_version:draft.draft_version,configuration_hash,active_revision_id:control.active_revision_id,activation_version:control.activation_version,inputs,warnings:report});
  return {draft_id:draft._id,draft_version:draft.draft_version,configuration_hash,base_revision_id:draft.base_revision_id,...control,complete:missing.length===0,findings:missing,warnings:report,warning_hash,results:inputs.map((input,input_index)=>{
    try { return {input_index,ok:true as const,data:{...calculate(normalizeInputs(input),draft.configuration,{revision_id:null,activation_version:control.activation_version}),production:false,draft_id:draft._id,draft_version:draft.draft_version}}; }
    catch(e) { if(!(e instanceof PricingError)) throw e; return {input_index,ok:false as const,error:{code:e.code,message:e.message,...(e.fields?{fields:e.fields}:{})}}; }
  })};
}
