const L=require('./_lib');
module.exports=async(req,res)=>{
  const s=L.session(req),a=s&&L.agent(req,s);
  if(!a)return res.status(401).json({error:'Log in and connect your agent first.'});
  const msgs=((req.body||{}).messages||[]).slice(-20).filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,4000)}));
  while(msgs[0]&&msgs[0].role!=='user')msgs.shift();
  if(!msgs.length)return res.status(400).json({error:'No message.'});
  try{
    let r,j,reply;
    if(a.provider==='openai'){
      r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.key},body:JSON.stringify({model:a.model,messages:msgs})});
      j=await r.json();reply=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
    }else{
      r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':a.key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:a.model,max_tokens:1024,messages:msgs})});
      j=await r.json();reply=Array.isArray(j.content)&&j.content.map(x=>x.text||'').join('');
    }
    if(!r.ok||!reply)return res.status(502).json({error:(j&&j.error&&j.error.message)||'The agent did not answer. Check your key and model.'});
    res.json({reply});
  }catch(e){res.status(502).json({error:'Could not reach the provider.'})}
};
