const L=require('./_lib');
const {P,SYSTEM}=require('./_llm');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to chat.'});
  const body=req.body||{};
  const p=P[body.provider];
  if(!p)return res.status(400).json({error:'Choose a provider.'});
  let key,model;
  if(p.credentialMode==='shared'){
    // Shared Keepsake providers: key comes from server env only.
    key=process.env[p.envVar];
    if(!key)return res.status(503).json({error:'This Keepsake provider is temporarily unavailable.'});
    model=p.models.includes(body.model)?body.model:p.defaultModel;
  }else{
    // User-owned providers: use the encrypted key stored for this logged-in user only.
    const a=L.agent(req,s);
    if(!a||a.provider!==p.id)return res.status(409).json({error:'Connect your '+p.name+' API key to use this provider.'});
    key=a.key;model=a.model;
  }
  const msgs=(Array.isArray(body.messages)?body.messages:[]).slice(-20)
    .filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string')
    .map(m=>({role:m.role,content:m.content.slice(0,4000)}));
  while(msgs[0]&&msgs[0].role!=='user')msgs.shift();
  if(!msgs.length)return res.status(400).json({error:'No message.'});
  try{
    const reply=await p.generate({key,model,system:SYSTEM,messages:msgs});
    res.json({reply,provider:p.id,model});
  }catch(e){
    // Log only the provider and status, never the key or raw response.
    console.error('llm_error',p.id,e.status||e.message);
    res.status(502).json({error:'The selected model is temporarily unavailable. Try another model.'});
  }
};
