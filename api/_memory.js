// Walrus Memory (MemWal) access. Server-side only. Each user gets their own namespace (hashed sub).
const crypto=require('crypto');
let factory=null;     // test hook
let cached=null;
function cfg(){
  return{
    key:process.env.MEMWAL_KEY||process.env.MEMWAL_PRIVATE_KEY,
    accountId:process.env.MEMWAL_ACCOUNT_ID,
    serverUrl:process.env.MEMWAL_SERVER_URL||'https://relayer-staging.memory.walrus.xyz'
  };
}
// Returns a client, or null if the server has no Walrus credentials. Throws if the SDK cannot load.
async function client(){
  if(factory)return factory();
  if(cached)return cached;
  const c=cfg();
  if(!c.key||!c.accountId)return null;
  const {MemWal}=await import('@mysten-incubation/memwal');
  cached=MemWal.create({key:c.key,accountId:c.accountId,serverUrl:c.serverUrl});
  return cached;
}
// Reason codes are safe to show users. Raw errors and config values are never returned.
const REASON={not_configured:'not_configured',sdk_failed:'sdk_failed',relayer_failed:'relayer_failed'};
async function getClient(){
  try{return{m:await client()}}
  catch(e){console.error('memwal_sdk_load_failed',e&&e.name);return{reason:REASON.sdk_failed}}
}
const ns=sub=>'keepsake-'+crypto.createHash('sha256').update(String(sub)).digest('hex').slice(0,24);
// Reject anything that looks like a credential before it can be written to memory.
const SECRET=/(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b[0-9a-fA-F]{40,}\b|\b[A-Za-z0-9+\/]{40,}={0,2}(?=\s|$))/;
const looksSecret=t=>SECRET.test(String(t));
const GRACE=8000;
function withGrace(p){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),GRACE))])}
async function recall(sub,query,limit=5){
  const g=await getClient();
  if(g.reason)return{status:'unavailable',reason:g.reason===REASON.sdk_failed?REASON.sdk_failed:REASON.not_configured,items:[]};
  if(!g.m)return{status:'unavailable',reason:REASON.not_configured,items:[]};
  try{
    const r=await g.m.recall({query,limit,namespace:ns(sub)});
    const items=((r&&r.results)||[]).map(x=>({text:String(x.text||x.content||x.plaintext||''),created:x.created_at||x.createdAt||''})).filter(x=>x.text&&!looksSecret(x.text));
    return{status:'ok',reason:'ok',items};
  }catch(e){console.error('memwal_recall_failed',e&&e.name);return{status:'unavailable',reason:REASON.relayer_failed,items:[]}}
}
// Submits facts, then waits briefly for confirmation. Never claims a save that was not accepted.
async function rememberMany(sub,facts){
  const clean=facts.filter(f=>typeof f==='string'&&f.trim()&&!looksSecret(f)).slice(0,5);
  if(!clean.length)return{status:'none',saved:0,reason:'ok'};
  const g=await getClient();
  if(g.reason||!g.m)return{status:'unavailable',saved:0,reason:g.reason||REASON.not_configured};
  try{
    const jobs=await Promise.all(clean.map(f=>g.m.remember(f,ns(sub))));
    const done=await withGrace(Promise.all(jobs.map(j=>g.m.waitForRememberJob(j.job_id).catch(()=>null))));
    const confirmed=done?done.filter(Boolean).length:0;
    return{status:confirmed===clean.length?'confirmed':'submitted',saved:clean.length,reason:'ok'};
  }catch(e){console.error('memwal_remember_failed',e&&e.name);return{status:'unavailable',saved:0,reason:REASON.relayer_failed}}
}
async function health(){
  const g=await getClient();
  if(g.reason)return{status:'unavailable',reason:g.reason};
  if(!g.m)return{status:'unavailable',reason:REASON.not_configured};
  try{await g.m.health();return{status:'ok',reason:'ok'}}catch(e){console.error('memwal_health_failed',e&&e.name);return{status:'unavailable',reason:REASON.relayer_failed}}
}
module.exports={recall,rememberMany,health,looksSecret,ns,setFactory:f=>{factory=f}};
