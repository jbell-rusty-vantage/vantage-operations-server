import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { MongoError } from 'mongodb';
import { authenticate, allowedTarget, type AuthOptions } from './auth';
import { fail, PricingError } from './domain';
import type { PricingStore } from './store';

export function pricingRouter(store:PricingStore,options:AuthOptions) {
  const router=express.Router();
  router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.locals.requestId=String(req.id??randomUUID());next();});
  router.use((req,res,next)=>express.raw({limit:req.path==='/calculate'?'8kb':'256kb',type:()=>true})(req,res,next));
  router.use(async(req:Request,res:Response,next:NextFunction)=>{
    try {
      const raw=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
      const actor=await authenticate(req,raw,options);
      if(req.path!=='/calculate'&&actor.actor_type!=='admin') fail(403,'FORBIDDEN');
      if(!allowedTarget(req.method,req.originalUrl)) fail(400,'INVALID_INPUT');
      if(req.method==='GET'&&raw.length) fail(400,'INVALID_INPUT');
      let body:unknown;
      if(req.method!=='GET') { try { body=JSON.parse(raw.toString('utf8')); } catch { fail(400,'INVALID_INPUT'); } }
      let data:unknown;
      const parts=req.path.split('/');
      if(req.method==='POST'&&req.path==='/calculate') data=await store.calculate(body);
      else if(req.method==='GET'&&req.path==='/configuration') data=await store.configuration();
      else if(req.method==='GET'&&req.path==='/revisions') data=await store.revisions(req.query);
      else if(req.method==='GET'&&parts[1]==='revisions') data=await store.getRevision(parts[2]!);
      else if(req.method==='POST'&&req.path==='/drafts') data=await store.createDraft(body,actor);
      else if(req.method==='GET'&&parts[1]==='drafts') data=await store.getDraft(parts[2]!);
      else if(req.method==='PUT'&&parts[1]==='drafts') data=await store.saveDraft(parts[2]!,body,actor);
      else if(parts[3]==='preview') data=await store.previewDraft(parts[2]!,body);
      else if(parts[3]==='publish') data=await store.command('publish',body,actor,parts[2]!);
      else if(req.path==='/activate') data=await store.command('activate',body,actor);
      else if(req.path==='/enabled') data=await store.command('set_enabled',body,actor);
      else fail(404,'NOT_FOUND');
      if(req.path==='/calculate') req.log.info({outcome:'CALCULATED',revision_id:(data as {revision_id:string}).revision_id},'Transportation pricing completed');
      res.json({ok:true,data});
    } catch(e) { next(e); }
  });
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    let e=error instanceof PricingError?error:null;
    if(!e&&error&&typeof error==='object'&&'status' in error) { if(error.status===413) e=new PricingError(413,'PAYLOAD_TOO_LARGE'); }
    if(!e) e=error instanceof MongoError ? new PricingError(503,'DEPENDENCY_UNAVAILABLE','Pricing is temporarily unavailable.') : new PricingError(500,'INTERNAL_ERROR','Pricing request failed.');
    _req.log.info({outcome:e.code},'Transportation pricing request denied or failed');
    res.status(e.status).json({ok:false,error:{code:e.code,message:e.message,...(e.fields?{fields:e.fields}:{})},request_id:res.locals.requestId});
  });
  return router;
}
