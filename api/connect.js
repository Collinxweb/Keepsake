const L=require('./_lib');
module.exports=(req,res)=>{
  const s=L.session(req);if(!s)return res.status(401).json({error:'Log in first.'});
  if(req.method==='DELETE'){L.setC(res,'ks_a','',0);return res.json({ok:true})}
  if(req.method!=='POST')return res.status(405).end();
  const{provider,model,key}=req.body||{};
  if(!['openai','anthropic'].includes(provider)||typeof key!=='string'||key.trim().length<20||key.length>300)return res.status(400).json({error:'Choose a provider and paste a valid API key.'});
  const m=String(model||'').trim().slice(0,80)||(provider==='openai'?'gpt-4o-mini':'claude-haiku-4-5-20251001');
  L.setC(res,'ks_a',L.enc(JSON.stringify({sub:s.sub,provider,model:m,key:key.trim()})),2592000);
  res.json({ok:true,agent:{provider,model:m}});
};
