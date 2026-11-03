import type { Db, Document } from 'mongodb';
import { MILEAGE_KEYS, VOLUME_KEYS, STATES } from './domain';

export const COLLECTIONS = { drafts:'moving_pricing_drafts',revisions:'moving_pricing_revisions',control:'moving_pricing_control',changes:'moving_pricing_changes' } as const;
const text={bsonType:'string'};
const integer={bsonType:['int','long','double'],minimum:0,multipleOf:1};
const positive={...integer,minimum:1};
const oid={bsonType:'objectId'};
const nullableId={bsonType:['objectId','null']};
const date={bsonType:'date'};
const actor={bsonType:'object',required:['actor_type','actor_id'],additionalProperties:false,properties:{actor_type:{enum:['admin','extension_user']},actor_id:{bsonType:'string',pattern:'^[0-9a-f]{24}$'}}};
const rate={bsonType:['string','null'],pattern:'^((0|[1-9][0-9]{0,2})\\.[0-9]{4}|1000\\.0000)$'};
const rates={bsonType:'object',required:[...VOLUME_KEYS],additionalProperties:false,properties:Object.fromEntries(VOLUME_KEYS.map(k=>[k,rate]))};
const configuration={bsonType:'object',required:['currency','base_rates','surcharge_groups'],additionalProperties:false,properties:{currency:{enum:['USD']},base_rates:{bsonType:'object',required:[...MILEAGE_KEYS],additionalProperties:false,properties:Object.fromEntries(MILEAGE_KEYS.map(k=>[k,rates]))},surcharge_groups:{bsonType:'array',maxItems:100,items:{bsonType:'object',required:['group_id','name','active','states','rates'],additionalProperties:false,properties:{group_id:{bsonType:'string',pattern:'^[0-9a-fA-F-]{36}$'},name:{bsonType:'string',minLength:1,maxLength:80},active:{bsonType:'bool'},states:{bsonType:'array',uniqueItems:true,maxItems:51,items:{enum:STATES}},rates}}}}};
const schema=(properties:Document)=>({$jsonSchema:{bsonType:'object',required:Object.keys(properties),additionalProperties:false,properties}});
export const VALIDATORS = {
  drafts:schema({_id:oid,schema_version:{enum:[1]},draft_version:positive,operation_id:text,create_request_hash:text,base_revision_id:nullableId,base_activation_version:integer,status:{enum:['editing','published']},published_revision_id:nullableId,configuration,created_at:date,updated_at:date,created_by:actor,updated_by:actor}),
  revisions:schema({_id:oid,schema_version:{enum:[1]},configuration,configuration_hash:text,source_draft_id:oid,source_draft_version:positive,created_at:date,created_by:actor,change_note:{bsonType:'string',minLength:1,maxLength:500}}),
  control:schema({_id:{enum:['transportation']},schema_version:{enum:[1]},active_revision_id:nullableId,activation_version:integer,calculation_enabled:{bsonType:'bool'},updated_at:date,updated_by:actor}),
  changes:schema({_id:oid,operation_id:text,request_hash:text,operation:{enum:['publish','activate','set_enabled']},actor,created_at:date,change_note:{bsonType:'string',minLength:1,maxLength:500},previous_revision_id:nullableId,revision_id:nullableId,previous_activation_version:integer,activation_version:positive,calculation_enabled:{bsonType:'bool'},response:{bsonType:'object'}}),
};
export const INDEXES = {
  drafts:[{key:{updated_at:-1,_id:-1},name:'draft_updated'},{key:{operation_id:1},name:'draft_operation',unique:true,sparse:true}],
  revisions:[{key:{created_at:-1,_id:-1},name:'revision_created'},{key:{source_draft_id:1},name:'revision_draft',unique:true}],
  control:[],
  changes:[{key:{operation_id:1},name:'change_operation',unique:true},{key:{activation_version:1},name:'change_activation',unique:true},{key:{created_at:-1,_id:-1},name:'change_created'}],
} as const;

/** Report is read-only. Apply is deliberately separate from HTTP/bootstrap. */
export async function setupPricing(db: Db, apply=false) {
  const existing=await db.listCollections({}, {nameOnly:true}).toArray();
  const report=Object.entries(COLLECTIONS).map(([key,name])=>({name,exists:existing.some(c=>c.name===name),validator:VALIDATORS[key as keyof typeof VALIDATORS],indexes:INDEXES[key as keyof typeof INDEXES]}));
  if(apply) {
    for(const entry of report) {
      if(entry.exists) await db.command({collMod:entry.name,validator:entry.validator,validationLevel:'strict',validationAction:'error'});
      else await db.createCollection(entry.name,{validator:entry.validator,validationLevel:'strict',validationAction:'error'});
      for(const index of entry.indexes) await db.collection(entry.name).createIndex(index.key,{name:index.name,...('unique' in index?{unique:index.unique}:{}),...('sparse' in index?{sparse:index.sparse}:{})});
    }
    await db.collection(COLLECTIONS.control).updateOne({_id:'transportation'} as Document,{$setOnInsert:{schema_version:1,active_revision_id:null,activation_version:0,calculation_enabled:false,updated_at:new Date(),updated_by:{actor_type:'admin',actor_id:'000000000000000000000000'}}},{upsert:true});
  }
  return {database:db.databaseName,applied:apply,collections:report};
}
