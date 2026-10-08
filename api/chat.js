const L=require('./_lib');
const {P,SYSTEM,EXTRACT}=require('./_llm');
const M=require('./_memory');
// Ask the same model which facts are worth keeping, then filter them. Empty on any failure.
async function extract(p,key,model,text){
  if(M.looksSecret(text))return[];
  try{
    const out=await p.generate({key,model,system:EXTRACT,messages:[{role:'user',content:text}]});
    const j=JSON.parse(out.replace(/^```(json)?/i,'').replace(/```$/,'').trim());
    if(!Array.isArray(j))return[];
    return j.filter(x=>typeof x==='string'&&x.length>3&&x.length<300&&!M.looksSecret(x)).slice(0,5);
  }catch(e){return[]}
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
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
  // Continuity: recall relevant memory before generating.
  const rec=await M.recall(s.sub,lastUser,5);
  const block=rec.items.length?'<keepsake_memory>\n'+rec.items.map(i=>'- '+i.text.slice(0,300)).join('\n')+'\n</keepsake_memory>':'';
  const memory={recalled:rec.items.length,recall:rec.status,saved:0,save:recording?'none':'off'};
  try{
    const reply=await p.generate({key,model,system:SYSTEM+(block?'\n\n'+block:''),messages:msgs});
    if(recording){
      const facts=await extract(p,key,model,lastUser);
      const w=await M.rememberMany(s.sub,facts);
      memory.saved=w.saved;memory.save=w.status;
    }
    res.json({reply,provider:p.id,model,memory});
  }catch(e){
    console.error('llm_error',p.id,e.status||e.message);
    res.status(502).json({error:'The selected model is temporarily unavailable. Try another model.'});
  }
};
