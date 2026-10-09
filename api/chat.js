const L=require('./_lib');
const {P,SYSTEM,EXTRACT}=require('./_llm');
const M=require('./_memory');
// Requests to delete or forget are answered here, without calling the model, so the reply can't claim a deletion.
const DELETE_RE=/\b(delete|forget|erase|clear|wipe|remove)\b[\s\S]*\b(memor\w*|everything|all (my|the) (facts|data|info\w*)|what you know)\b|forget (me|everything)/i;
const DELETE_REPLY='Deleting memories is not available from chat yet. Nothing was deleted.';
// Lines that describe saving, profiles, or internal machinery are dropped. Inline "I have saved that" is removed and the fact kept.
const CLAIM_LINE=/(profile|cleared|deleted|keepsake_memory|memory block|updated your|using your saved|using your memor|saved memories to)/i;
function sanitize(text){
  const kept=String(text||'').split('\n').filter(l=>!CLAIM_LINE.test(l)).join('\n');
  const out=kept.replace(/(^|[\n.!?]\s*)I (?:have |'ve )?(?:saved|noted|recorded|stored)\s+(?:that\s+)?(\S)/gi,(m,p,c)=>p+c.toUpperCase()).replace(/\n{3,}/g,'\n\n').trim();
  return out||'I do not have saved information that answers that yet.';
}
async function extract(p,key,model,text){
  if(M.looksSecret(text))return[];
  try{
    const out=await M.withTimeout(p.generate({key,model,system:EXTRACT,messages:[{role:'user',content:text}]}),12000);
    const j=JSON.parse(out.replace(/^```(json)?/i,'').replace(/```$/,'').trim());
    if(!Array.isArray(j))return[];
    return j.filter(x=>typeof x==='string'&&x.length>3&&x.length<300&&!M.looksSecret(x)).slice(0,5);
  }catch(e){return[]}
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const T0=Date.now();
  const logDone=(status,extra)=>console.log('chat_done',JSON.stringify({status,totalMs:Date.now()-T0,...extra}));
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to chat.'});
  const body=req.body||{};
  const p=P[body.provider];
  if(!p)return res.status(400).json({error:'Choose a provider.'});
  let key,model;
  if(p.credentialMode==='shared'){
    key=process.env[p.envVar];
    if(!key)return res.status(503).json({error:'This Keepsake provider is temporarily unavailable.'});
    model=p.models.includes(body.model)?body.model:p.defaultModel;
  }else{
    const a=L.agent(req,s);
    if(!a||a.provider!==p.id)return res.status(409).json({error:'Connect your '+p.name+' API key to use this provider.'});
    key=a.key;model=a.model;
  }
  const msgs=(Array.isArray(body.messages)?body.messages:[]).slice(-20)
    .filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string')
    .map(m=>({role:m.role,content:m.content.slice(0,4000)}));
  while(msgs[0]&&msgs[0].role!=='user')msgs.shift();
  if(!msgs.length)return res.status(400).json({error:'No message.'});
  const lastUser=[...msgs].reverse().find(m=>m.role==='user').content;
  const recording=body.recording===true;
  const noMemory={recalled:0,recall:'off',reason:'ok',saved:0,save:'off',saveReason:'ok'};
  if(DELETE_RE.test(lastUser))return res.json({reply:DELETE_REPLY,provider:p.id,model,memory:noMemory});
  const t0=Date.now();
  const rec=await M.recall(s.sub,lastUser,5);
  const memMs=Date.now()-t0;
  const block=rec.items.length?'<keepsake_memory>\n'+rec.items.map(i=>'- '+i.text.slice(0,300)).join('\n')+'\n</keepsake_memory>':'';
  const memory={recalled:rec.items.length,recall:rec.status,reason:rec.reason,saved:0,save:recording?'none':'off',saveReason:'ok'};
  try{
    const t1=Date.now();
    const reply=await M.withTimeout(p.generate({key,model,system:SYSTEM+(block?'\n\n'+block:''),messages:msgs}),25000);
    memory.timing={memMs,modelMs:Date.now()-t1};
    if(recording){
      const t2=Date.now();
      const facts=await extract(p,key,model,lastUser);
      memory.timing.extractMs=Date.now()-t2;
      const w=await M.rememberMany(s.sub,facts);
      memory.saved=w.saved;memory.save=w.status;memory.saveReason=w.reason;
    }
    logDone(200,{provider:p.id,memMs,modelMs:memory.timing&&memory.timing.modelMs,recalled:memory.recalled,save:memory.save});
    res.json({reply:sanitize(reply),provider:p.id,model,memory});
  }catch(e){
    logDone(e.message==='timeout'?504:502,{provider:p.id,memMs,reason:e.message==='timeout'?'model_timeout':'provider_error'});
    if(e.message==='timeout')return res.status(504).json({error:'The model did not answer in time. Try again.'});
    console.error('llm_error',p.id,e.status||e.message);
    res.status(502).json({error:'The selected model is temporarily unavailable. Try another model.'});
  }
};
module.exports.sanitize=sanitize;
