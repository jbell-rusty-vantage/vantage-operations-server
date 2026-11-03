import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { fail, object, type Actor } from './domain';

export const ADMIN_HEADERS = ['x-vantage-operations-actor-id','x-vantage-operations-role','x-vantage-operations-timestamp','x-vantage-operations-request-id','x-vantage-operations-signature'] as const;
export function allowedTarget(method:string,target:string):boolean {
  if(/[\r\n#]/.test(target)||target.includes('//')||target.includes('/./')||target.includes('/../')) return false;
  const [path,query]=target.split('?');
  const base='/api/v1/pricing';
  if(method==='GET'&&path===`${base}/revisions`) {
    if(query===undefined) return true;
    const params=new URLSearchParams(query),keys=[...params.keys()];
    if(keys.length===0||new Set(keys).size!==keys.length||keys.some(k=>!['cursor','limit'].includes(k))) return false;
    params.sort(); return `${path}?${params.toString()}`===target;
  }
  if(query!==undefined) return false;
  return (method==='POST'&&[`${base}/calculate`,`${base}/drafts`,`${base}/activate`,`${base}/enabled`].includes(path!)) ||
    (method==='GET'&&path===`${base}/configuration`) ||
    (method==='GET'&&new RegExp(`^${base}/revisions/[a-f0-9]{24}$`).test(path!)) ||
    (['GET','PUT'].includes(method)&&new RegExp(`^${base}/drafts/[a-f0-9]{24}$`).test(path!)) ||
    (method==='POST'&&new RegExp(`^${base}/drafts/[a-f0-9]{24}/(preview|publish)$`).test(path!));
}
export function adminCanonical(actorId:string,role:string,timestamp:string,requestId:string,method:string,target:string,body:Buffer):string {
  return ['vantage-operations-admin-v1','transportation-pricing',actorId,role,timestamp,requestId,method,target,createHash('sha256').update(body).digest('hex')].join('\n');
}
function header(req:Request,name:string):string|undefined {
  if(req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i]!.toLowerCase()===name).length>1) fail(401,'UNAUTHENTICATED');
  const value=req.headers[name];if(Array.isArray(value)||value?.includes('\r')||value?.includes('\n')) fail(401,'UNAUTHENTICATED');return value;
}
export function verifyAdmin(req:Request,body:Buffer,secret?:string,now=Date.now()):Actor {
  if(!secret) fail(503,'AUTH_UNAVAILABLE');
  if(header(req,'authorization')!==undefined) fail(401,'UNAUTHENTICATED');
  const [actorId,role,timestamp,requestId,signature]=ADMIN_HEADERS.map(h=>header(req,h));
  if(!actorId||!/^[a-f0-9]{24}$/.test(actorId)||role!=='owner'||!timestamp||!/^[1-9][0-9]*$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||!requestId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId)||!signature||!/^[a-f0-9]{64}$/.test(signature)||!allowedTarget(req.method,req.originalUrl)) fail(401,'UNAUTHENTICATED');
  if(now-Number(timestamp)>30000||Number(timestamp)-now>5000) fail(401,'UNAUTHENTICATED');
  const expected=createHmac('sha256',secret).update(adminCanonical(actorId,role,timestamp,requestId,req.method,req.originalUrl,body)).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex'))) fail(401,'UNAUTHENTICATED');
  return {actor_type:'admin',actor_id:actorId};
}
export interface AuthOptions { mainServerAuthBaseUrl?:string; operationsAdminSigningSecret?:string; fetch?:typeof fetch }

export async function extensionActor(token:string,baseUrl:string|undefined,fetcher:typeof fetch=fetch):Promise<Actor> {
  if(!baseUrl) fail(503,'AUTH_UNAVAILABLE');
  let origin:URL;
  try { origin=new URL(baseUrl);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) fail(503,'AUTH_UNAVAILABLE'); }
  catch { fail(503,'AUTH_UNAVAILABLE'); }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try {
    const response=await fetcher(new URL('/api/v1/extension/auth/me',origin),{method:'GET',headers:{authorization:`Bearer ${token}`},redirect:'error',signal:controller.signal,credentials:'omit',cache:'no-store'});
    if(response.status===401) fail(401,'UNAUTHENTICATED');
    if(!response.ok||response.redirected) fail(503,'AUTH_UNAVAILABLE');
    if(Number(response.headers.get('content-length'))>16384) fail(503,'AUTH_UNAVAILABLE');
    const reader=response.body?.getReader(); if(!reader) fail(503,'AUTH_UNAVAILABLE');
    const chunks:Uint8Array[]=[];let length=0;
    try { for(;;) { const {value,done}=await reader.read();if(done) break;length+=value.byteLength;if(length>16384) { await reader.cancel();fail(503,'AUTH_UNAVAILABLE'); } chunks.push(value); } } finally { reader.releaseLock(); }
    const data=object(JSON.parse(Buffer.concat(chunks).toString('utf8'))),user=object(object(data.data).user);
    if(data.ok!==true||typeof user.id!=='string'||!/^[a-fA-F0-9]{24}$/.test(user.id)||typeof user.email!=='string'||!/^\S+@\S+\.\S+$/.test(user.email)||!Array.isArray(user.roles)||!user.roles.length||new Set(user.roles).size!==user.roles.length||user.roles.some(r=>!['owner','sales','customer_service'].includes(r as string))) fail(503,'AUTH_UNAVAILABLE');
    return {actor_type:'extension_user',actor_id:user.id.toLowerCase(),roles:user.roles as string[]};
  } catch(e) { if(e instanceof Error&&'code' in e&&(e.code==='UNAUTHENTICATED'||e.code==='AUTH_UNAVAILABLE')) throw e; fail(503,'AUTH_UNAVAILABLE'); }
  finally { clearTimeout(timer); }
}
export async function authenticate(req:Request,body:Buffer,options:AuthOptions):Promise<Actor> {
  if(ADMIN_HEADERS.some(h=>req.headers[h]!==undefined)) return verifyAdmin(req,body,options.operationsAdminSigningSecret);
  const auth=header(req,'authorization');
  if(!auth||Buffer.byteLength(auth)>8192||!/^Bearer [^\s,]+$/.test(auth)) fail(401,'UNAUTHENTICATED');
  const actor=await extensionActor(auth.slice(7),options.mainServerAuthBaseUrl,options.fetch);
  if(!actor.roles?.some(r=>r==='owner'||r==='sales')) fail(403,'FORBIDDEN');
  return actor;
}
