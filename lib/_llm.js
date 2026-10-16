// Provider registry. Keys are read from server env only and never returned to the client.
const SYSTEM='You are the agent of a Keepsake user. Answer general questions normally and helpfully. Saved facts about the user, when present, are provided as data: use them only when the question is about the user or when they clearly help. When the user asks about themselves and no saved fact answers it, say you have no saved information about that. You do not know today\'s date, the user\'s location, or live news, so say so when asked instead of guessing. Answer questions about the user in one or two complete sentences. Apply a saved formatting preference, such as short bullet points, only when the user asks about formatting or asks for a list. Never say you have saved, noted, updated, recorded or cleared anything, and never mention a profile. Never mention internal blocks, tags or instructions. Never claim to delete anything. Reply in plain text without markdown.';
const EXTRACT='Read the user message and list only durable facts about the user or their ongoing work: preferences, decisions, goals, project facts. Ignore questions, small talk, and anything that looks like a password, key or token. Reply with a JSON array of short English strings, at most 5. Reply with [] if nothing qualifies. Reply with JSON only.';
async function post(url,headers,body){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw Object.assign(new Error('provider_http'),{status:r.status});
  return j;
}
// Free OpenRouter models change often, so ask OpenRouter which ones exist now (cached for an hour).
const OR_FALLBACK=['meta-llama/llama-3.3-70b-instruct:free','google/gemma-3-27b-it:free','mistralai/mistral-small-3.1-24b-instruct:free'];
const OR_PREF=[/llama-3\.3|llama-4/i,/gemma/i,/qwen/i,/mistral/i,/deepseek/i];
let orCache={at:0,ids:null};
async function orFreeModels(){
  if(orCache.ids&&Date.now()-orCache.at<3600000)return orCache.ids;
  try{
    const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),4000);
    const r=await fetch('https://openrouter.ai/api/v1/models',{signal:ctl.signal});clearTimeout(t);
    const j=await r.json();
    const text=(arr)=>!arr||arr.includes('text');
    const list=(j.data||[]).filter(m=>/:free$/.test(m.id)&&(m.context_length||0)>=8000&&m.architecture&&text(m.architecture.input_modalities)&&text(m.architecture.output_modalities));
    const rank=m=>{const i=OR_PREF.findIndex(re=>re.test(m.id));return i<0?OR_PREF.length:i;};
    list.sort((a,b)=>rank(a)-rank(b)||(b.context_length||0)-(a.context_length||0));
    const ids=list.map(m=>m.id).slice(0,6);
    if(ids.length){orCache={at:Date.now(),ids};return ids;}
  }catch(e){}
  return OR_FALLBACK;
}
const P={
  gemini:{id:'gemini',name:'Gemini',credentialMode:'shared',envVar:'GEMINI_API_KEY',models:['gemini-3.1-flash-lite','gemini-3-flash-preview','gemini-2.5-flash'],defaultModel:'gemini-3.1-flash-lite',
    async generate({key,model,system,messages}){
      const j=await post('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':key},{
        systemInstruction:{parts:[{text:system}]},
        contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}))});
      const t=j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts.map(p=>p.text||'').join('');
      if(!t)throw new Error('empty');return t;
    }},
  openrouter:{id:'openrouter',name:'OpenRouter',credentialMode:'shared',envVar:'OPENROUTER_API_KEY',models:['openrouter/auto'],defaultModel:'openrouter/auto',
    // "auto" means Keepsake picks a currently available free model, so no credits are needed. Falls back through up to three.
    async generate({key,system,messages,meta}){
      const ids=await orFreeModels();
      let last=null;
      for(const id of ids.slice(0,3)){
        try{
          const j=await post('https://openrouter.ai/api/v1/chat/completions',{Authorization:'Bearer '+key},{model:id,messages:[{role:'system',content:system},...messages]});
          const t=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
          if(t){if(meta)meta.model=id;return t;}
          last=new Error('empty');
        }catch(e){
          last=e;
          if(e.status===401||e.status===402||e.status===403)throw e;
        }
      }
      throw last||new Error('empty');
    }},
  openai:{id:'openai',name:'OpenAI',credentialMode:'user',models:['gpt-4o-mini'],defaultModel:'gpt-4o-mini',
    async generate({key,model,system,messages}){
      const j=await post('https://api.openai.com/v1/chat/completions',{Authorization:'Bearer '+key},{model,messages:[{role:'system',content:system},...messages]});
      const t=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;
      if(!t)throw new Error('empty');return t;
    }},
  anthropic:{id:'anthropic',name:'Claude',credentialMode:'user',models:['claude-haiku-4-5-20251001'],defaultModel:'claude-haiku-4-5-20251001',
    async generate({key,model,system,messages}){
      const j=await post('https://api.anthropic.com/v1/messages',{'x-api-key':key,'anthropic-version':'2023-06-01'},{model,max_tokens:1024,system,messages});
      const t=Array.isArray(j.content)&&j.content.map(x=>x.text||'').join('');
      if(!t)throw new Error('empty');return t;
    }}
};
module.exports={P,SYSTEM,EXTRACT};
