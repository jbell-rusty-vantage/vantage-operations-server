import { ObjectId } from 'bson';
import type { Db, Document, ClientSession } from 'mongodb';
import { COLLECTIONS } from './setup';
import { calculate, emptyConfiguration, exact, fail, findings, hash, id, normalizeInputs, note, object, PricingError, uuid, validateConfiguration, version, type Actor, type Configuration, type Inputs } from './domain';
import { preview } from './preview';

const identity=(actor:Actor)=>({actor_type:actor.actor_type,actor_id:actor.actor_id});
const wire=(doc:Document):any=>JSON.parse(JSON.stringify(doc));
export type WritePoint = 'revision'|'control'|'draft'|'change';
export interface StoreOptions { afterWrite?: (point:WritePoint)=>Promise<void> }

export class PricingStore {
  constructor(private readonly getDb:()=>Promise<Db>,private readonly options:StoreOptions={}) {}
  private async ready() {
    let db:Db;
    try { db=await this.getDb(); }
    catch { fail(503,'DEPENDENCY_UNAVAILABLE'); }
    // No request may implicitly create collections in the shared database.
    const existing=await db.listCollections({name:{$in:Object.values(COLLECTIONS)}},{nameOnly:true}).toArray();
    if(existing.length!==4) fail(503,'PRICING_NOT_CONFIGURED');
    return db;
  }
  private async control(db:Db,session?:ClientSession) {
    const result=await db.collection(COLLECTIONS.control).findOne({_id:'transportation'} as Document,{session,...(!session?{readConcern:{level:'majority' as const},readPreference:'primary' as const}:{})});
    if(!result) fail(503,'PRICING_NOT_CONFIGURED');
    if(result.schema_version!==1||!Number.isSafeInteger(result.activation_version)||result.activation_version<0||typeof result.calculation_enabled!=='boolean'||(result.active_revision_id!==null&&!(result.active_revision_id instanceof ObjectId))) fail(503,'CONFIGURATION_CORRUPT');
    return result;
  }
  private async revision(db:Db,revisionId:string,session?:ClientSession) {
    const r=await db.collection(COLLECTIONS.revisions).findOne({_id:new ObjectId(id(revisionId))},{session});
    if(!r) fail(404,'REVISION_NOT_FOUND');
    try { if(r.schema_version!==1||hash(r.configuration)!==r.configuration_hash||hash(validateConfiguration(r.configuration))!==r.configuration_hash) fail(503,'CONFIGURATION_CORRUPT'); }
    catch { fail(503,'CONFIGURATION_CORRUPT'); }
    return r;
  }
  private async selected(db:Db,control:Document,session?:ClientSession) {
    if(!control.active_revision_id) return null;
    try { return await this.revision(db,String(control.active_revision_id),session); }
    catch(e) { if(e instanceof PricingError && e.code==='REVISION_NOT_FOUND') fail(503,'CONFIGURATION_CORRUPT'); throw e; }
  }
  private async draft(db:Db,draftId:string,session?:ClientSession) {
    const d=await db.collection(COLLECTIONS.drafts).findOne({_id:new ObjectId(id(draftId))},{session});
    if(!d) fail(404,'DRAFT_NOT_FOUND'); return d;
  }
  private editing(d:Document,expected:number) { if(d.status!=='editing') fail(409,'DRAFT_ALREADY_PUBLISHED'); if(d.draft_version!==expected) throw new PricingError(409,'DRAFT_VERSION_CONFLICT',`Reload draft version ${d.draft_version}.`,[{code:'CURRENT_VERSION',path:'draft_version',message:String(d.draft_version)}]); }
  async configuration() { const db=await this.ready(),control=await this.control(db),revision=await this.selected(db,control); return wire({control,revision}); }
  async getRevision(revisionId:string) { return wire(await this.revision(await this.ready(),revisionId)); }
  async getDraft(draftId:string) { return wire(await this.draft(await this.ready(),draftId)); }
  async revisions(query:Record<string,unknown>) {
    exact(query,[],['cursor','limit']);
    const limit=query.limit===undefined?20:typeof query.limit==='string'&&/^[1-9][0-9]{0,2}$/.test(query.limit)?Number(query.limit):0;
    if(limit<1||limit>100) fail(400,'INVALID_INPUT');
    let filter:Document={};
    if(query.cursor!==undefined) {
      try {
        if(typeof query.cursor!=='string'||query.cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(query.cursor)) fail(400,'INVALID_INPUT');
        const cursor=object(JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'))); exact(cursor,['created_at','id']);
        if(typeof cursor.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.created_at)||!Number.isFinite(Date.parse(cursor.created_at))||new Date(cursor.created_at).toISOString()!==cursor.created_at) fail(400,'INVALID_INPUT');
        const date=new Date(cursor.created_at),oid=new ObjectId(id(cursor.id)); filter={$or:[{created_at:{$lt:date}},{created_at:date,_id:{$lt:oid}}]};
      } catch { fail(400,'INVALID_INPUT'); }
    }
    const db=await this.ready(),rows=await db.collection(COLLECTIONS.revisions).find(filter,{projection:{configuration:0}}).sort({created_at:-1,_id:-1}).limit(limit+1).toArray();
    const items=rows.slice(0,limit),last=items.at(-1);
    return {items:wire(items),next_cursor:rows.length>limit&&last?Buffer.from(JSON.stringify({created_at:last.created_at.toISOString(),id:String(last._id)})).toString('base64url'):null};
  }
  async createDraft(raw:unknown,actor:Actor) {
    const body=object(raw); exact(body,['base_revision_id','operation_id']); const operation_id=uuid(body.operation_id),base=body.base_revision_id===null?null:id(body.base_revision_id);
    const requestHash=hash({operation:'create_draft',body:{base_revision_id:base,operation_id},actor:identity(actor)}),db=await this.ready();
    const replay=async()=>{ const existing=await db.collection(COLLECTIONS.drafts).findOne({operation_id}); if(existing) { if(existing.create_request_hash!==requestHash) fail(409,'IDEMPOTENCY_CONFLICT'); return wire(existing); } return null; };
    const existing=await replay(); if(existing) return existing;
    const control=await this.control(db),configuration=base?(await this.revision(db,base)).configuration:emptyConfiguration(),now=new Date();
    const draft={_id:new ObjectId(),schema_version:1,draft_version:1,operation_id,create_request_hash:requestHash,base_revision_id:base?new ObjectId(base):null,base_activation_version:control.activation_version,status:'editing',published_revision_id:null,configuration,created_at:now,updated_at:now,created_by:identity(actor),updated_by:identity(actor)};
    try { await db.collection(COLLECTIONS.drafts).insertOne(draft); } catch(e) { if((e as {code?:number}).code===11000) return (await replay())??fail(409,'IDEMPOTENCY_CONFLICT'); throw e; }
    return wire(draft);
  }
  async saveDraft(draftId:string,raw:unknown,actor:Actor) {
    const body=object(raw); exact(body,['expected_draft_version','configuration']); const expected=version(body.expected_draft_version,1),db=await this.ready(),draft=await this.draft(db,draftId); this.editing(draft,expected);
    const config=validateConfiguration(body.configuration,new Set((draft.configuration as Configuration).surcharge_groups.map(g=>g.group_id)));
    const updated=await db.collection(COLLECTIONS.drafts).findOneAndUpdate({_id:draft._id,status:'editing',draft_version:expected},{$set:{configuration:config,updated_at:new Date(),updated_by:identity(actor)},$inc:{draft_version:1}},{returnDocument:'after'});
    if(!updated) { this.editing(await this.draft(db,draftId),expected); fail(409,'DRAFT_VERSION_CONFLICT'); } return wire(updated);
  }
  private samples(raw:unknown):unknown[] { if(!Array.isArray(raw)||raw.length>100) fail(400,'INVALID_INPUT'); return raw; }
  async previewDraft(draftId:string,raw:unknown) {
    const body=object(raw);exact(body,['expected_draft_version','inputs']); const expected=version(body.expected_draft_version,1),inputs=this.samples(body.inputs),db=await this.ready(),draft=await this.draft(db,draftId);this.editing(draft,expected);
    const control=await this.control(db),active=await this.selected(db,control);
    return preview(wire(draft),wire(control),active?.configuration??null,inputs);
  }
  async calculate(raw:unknown) {
    const inputs=normalizeInputs(raw),db=await this.ready(),control=await this.control(db);
    if(!control.active_revision_id) fail(503,'PRICING_NOT_CONFIGURED'); if(!control.calculation_enabled) fail(503,'PRICING_DISABLED');
    const revision=await this.selected(db,control);
    return calculate(inputs,revision!.configuration,{revision_id:String(revision!._id),activation_version:control.activation_version});
  }
  async command(operation:'publish'|'activate'|'set_enabled',raw:unknown,actor:Actor,draftId?:string) {
    const b=object(raw);
    exact(b,operation==='publish'?['expected_draft_version','expected_activation_version','operation_id','change_note']:operation==='activate'?['revision_id','expected_activation_version','operation_id','change_note']:['calculation_enabled','expected_activation_version','operation_id','change_note'],operation==='publish'?['preview_inputs','acknowledged_warning_hash']:[]);
    const operation_id=uuid(b.operation_id),expected=version(b.expected_activation_version),change_note=note(b.change_note);
    if(operation==='publish') { id(draftId); version(b.expected_draft_version,1); if(b.preview_inputs!==undefined) this.samples(b.preview_inputs); if(b.acknowledged_warning_hash!==undefined&&(typeof b.acknowledged_warning_hash!=='string'||!/^[a-f0-9]{64}$/.test(b.acknowledged_warning_hash))) fail(400,'INVALID_INPUT'); }
    if(operation==='activate') id(b.revision_id);
    if(operation==='set_enabled'&&typeof b.calculation_enabled!=='boolean') fail(400,'INVALID_INPUT');
    const requestHash=hash({operation,draft_id:draftId??null,body:b,actor:identity(actor)}),db=await this.ready();
    const replay=async(session?:ClientSession)=> { const old=await db.collection(COLLECTIONS.changes).findOne({operation_id},{session}); if(old) { if(old.request_hash!==requestHash) fail(409,'IDEMPOTENCY_CONFLICT'); return old.response; } return null; };
    const saved=await replay(); if(saved) return saved;
    const session=db.client.startSession();
    try {
      return await session.withTransaction(async()=>{
        const saved=await replay(session);if(saved) return saved;
        const control=await this.control(db,session);if(control.activation_version!==expected) fail(409,'ACTIVATION_VERSION_CONFLICT');
        let revisionId=control.active_revision_id,draft:Document|undefined;
        if(operation==='publish') {
          draft=await this.draft(db,draftId!,session);this.editing(draft,Number(b.expected_draft_version));
          const config=validateConfiguration(draft.configuration),missing=findings(config); if(missing.length) throw new PricingError(422,'CONFIGURATION_INVALID','Complete every rate before publication.',missing);
          const active=await this.selected(db,control,session),report=preview(wire(draft),wire(control),active?.configuration??null,this.samples(b.preview_inputs??[]));
          if(report.warnings.length&&b.acknowledged_warning_hash!==report.warning_hash) fail(409,'PREVIEW_ACKNOWLEDGEMENT_STALE');
          revisionId=new ObjectId();
          await db.collection(COLLECTIONS.revisions).insertOne({_id:revisionId,schema_version:1,configuration:config,configuration_hash:hash(config),source_draft_id:draft._id,source_draft_version:draft.draft_version,created_at:new Date(),created_by:identity(actor),change_note},{session});
          await this.options.afterWrite?.('revision');
        } else if(operation==='activate') {
          const revision=await this.revision(db,String(b.revision_id),session); if(findings(revision.configuration).length) fail(422,'CONFIGURATION_INVALID'); revisionId=revision._id;
        }
        const enabled=operation==='set_enabled'?b.calculation_enabled as boolean:control.calculation_enabled;
        if(enabled&&!revisionId) fail(503,'PRICING_NOT_CONFIGURED');
        if(enabled&&operation==='set_enabled') { const active=await this.selected(db,control,session);if(!active||findings(active.configuration).length) fail(503,'CONFIGURATION_CORRUPT'); }
        const update=await db.collection(COLLECTIONS.control).updateOne({_id:'transportation',activation_version:expected} as Document,{$set:{active_revision_id:revisionId,calculation_enabled:enabled,updated_at:new Date(),updated_by:identity(actor)},$inc:{activation_version:1}},{session});
        if(update.modifiedCount!==1) fail(409,'ACTIVATION_VERSION_CONFLICT'); await this.options.afterWrite?.('control');
        if(draft) {
          const update=await db.collection(COLLECTIONS.drafts).updateOne({_id:draft._id,status:'editing',draft_version:b.expected_draft_version},{$set:{status:'published',published_revision_id:revisionId,updated_at:new Date(),updated_by:identity(actor)},$inc:{draft_version:1}},{session});
          if(update.modifiedCount!==1) fail(409,'DRAFT_VERSION_CONFLICT'); await this.options.afterWrite?.('draft');
        }
        const response={revision_id:revisionId?String(revisionId):null,activation_version:expected+1,...(draft?{draft_version:draft.draft_version+1}:{}),calculation_enabled:enabled};
        await db.collection(COLLECTIONS.changes).insertOne({_id:new ObjectId(),operation_id,request_hash:requestHash,operation,actor:identity(actor),created_at:new Date(),change_note,previous_revision_id:control.active_revision_id,revision_id:revisionId,previous_activation_version:expected,activation_version:expected+1,calculation_enabled:enabled,response},{session}); await this.options.afterWrite?.('change');
        return response;
      },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
    } catch(e) {
      if((e as {code?:number}).code===11000) { const saved=await replay();if(saved) return saved; fail(409,'ACTIVATION_VERSION_CONFLICT'); }
      throw e;
    } finally { await session.endSession(); }
  }
}
