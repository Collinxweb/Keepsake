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
async function client(){
  if(factory)return factory();
  if(cached)return cached;
  const c=cfg();
  if(!c.key||!c.accountId)return null;
  const {MemWal}=await import('@mysten-incubation/memwal');
  cached=MemWal.create({key:c.key,accountId:c.accountId,serverUrl:c.serverUrl});
  return cached;
}
const ns=sub=>'keepsake-'+crypto.createHash('sha256').update(String(sub)).digest('hex').slice(0,24);
// Reject anything that looks like a credential before it can be written to memory.
const SECRET=/(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b[0-9a-fA-F]{40,}\b|\b[A-Za-z0-9+\/]{40,}={0,2}(?=\s|$))/;
const looksSecret=t=>SECRET.test(String(t));
const GRACE=8000;
function withGrace(p){return Promise.race([p,new Promise(r=>setTimeout(()=>r(null),GRACE))])}
async function recall(sub,query,limit=5){
  try{
    const m=await client();
    if(!m)return{status:'unavailable',items:[]};
    const r=await m.recall({query,limit,namespace:ns(sub)});
    const items=((r&&r.results)||[]).map(x=>({text:String(x.text||x.content||x.plaintext||''),created:x.created_at||x.createdAt||''})).filter(x=>x.text&&!looksSecret(x.text));
    return{status:'ok',items};
  }catch(e){console.error('memwal_recall_failed');return{status:'unavailable',items:[]}}
}
// Submits facts, then waits briefly for confirmation. Never claims a save that was not accepted.
async function rememberMany(sub,facts){
  const clean=facts.filter(f=>typeof f==='string'&&f.trim()&&!looksSecret(f)).slice(0,5);
  if(!clean.length)return{status:'none',saved:0};
  try{
    const m=await client();
    if(!m)return{status:'unavailable',saved:0};
    const jobs=await Promise.all(clean.map(f=>m.remember(f,ns(sub))));
    const done=await withGrace(Promise.all(jobs.map(j=>m.waitForRememberJob(j.job_id).catch(()=>null))));
    const confirmed=done?done.filter(Boolean).length:0;
    return{status:confirmed===clean.length?'confirmed':'submitted',saved:clean.length};
  }catch(e){console.error('memwal_remember_failed');return{status:'unavailable',saved:0}}
}
async function health(){
  try{const m=await client();if(!m)return'unavailable';await m.health();return'ok'}catch(e){return'unavailable'}
}
module.exports={recall,rememberMany,health,looksSecret,ns,setFactory:f=>{factory=f}};
