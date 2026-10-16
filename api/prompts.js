const crypto=require('crypto');
const L=require('../lib/_lib');
const M=require('../lib/_memory');
const {P}=require('../lib/_llm');
// Prompt library. Each prompt is one record in a per-account Walrus namespace that is separate from chat facts.
// Hidden ids go in a second namespace, because Walrus cannot delete yet.
const ID_RE=/^[a-f0-9]{12}$/;
const pns=sub=>M.ns(sub)+'-prompts';
const hns=sub=>M.ns(sub)+'-prompts-hidden';
const oneLine=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
const body=(v,n)=>String(v==null?'':v).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
function pack(p){
  return['[Keepsake prompt]','ID: '+p.id,'Number: '+p.number,'Title: '+p.title,'Saved: '+p.savedAt,'Hash: '+p.hash,'---',p.text].join('\n');
}
function unpack(t){
  const s=String(t);
  if(!s.startsWith('[Keepsake prompt]'))return null;
  const i=s.indexOf('\n---\n');if(i<0)return null;
  const head=s.slice(0,i),text=s.slice(i+5);
  const g=k=>{const m=head.match(new RegExp('^'+k+': (.*)$','m'));return m?m[1].trim():'';};
  const id=g('ID');if(!ID_RE.test(id))return null;
  const number=parseInt(g('Number'),10);
  return{id,number:Number.isFinite(number)?number:0,title:g('Title')||'Untitled prompt',savedAt:g('Saved'),hash:g('Hash'),text};
}
const hits=new Map();
function limited(sub){const now=Date.now(),a=(hits.get(sub)||[]).filter(t=>now-t<600000);if(a.length>=30){hits.set(sub,a);return true;}a.push(now);hits.set(sub,a);if(hits.size>5000)hits.clear();return false;}
function autoTitle(text){const line=text.split('\n').map(x=>x.trim()).find(Boolean)||'Untitled prompt';return oneLine(line,60);}

// Gemini writes a short, distinctive name for a saved prompt, so it is easy to find later by meaning.
// Uses the shared Gemini key only for this, regardless of which model the user chats with.
const NAME_SYS='Give a short, distinctive title for the prompt the user provides, 3 to 6 words, title case, no quotes, no trailing punctuation, no the word "prompt". Reply with the title only.';
async function nameWithGemini(text){
  const key=process.env.GEMINI_API_KEY;
  if(!key)return autoTitle(text);
  try{
    const out=await M.withTimeout(P.gemini.generate({key,model:P.gemini.defaultModel,system:NAME_SYS,messages:[{role:'user',content:text.slice(0,2000)}]}),6000);
    const title=oneLine(out,60).replace(/^["'“]+|["'”]+$/g,'');
    return title||autoTitle(text);
  }catch(e){return autoTitle(text)}
}

async function loadPrompts(sub,query,limit){
  const [r,h]=await Promise.all([M.recallNs(pns(sub),query||'saved prompts',limit||60),M.recallNs(hns(sub),'hidden prompt ids',100)]);
  if(r.status!=='ok')return{status:r.status,reason:r.reason,items:[]};
  const hidden=new Set();
  for(const it of h.items){const m=String(it.text).match(/^ID: ([a-f0-9]{12})$/m);if(m)hidden.add(m[1]);}
  const byId=new Map();
  for(const it of r.items){const p=unpack(it.text);if(p&&!byId.has(p.id))byId.set(p.id,p);}
  const items=[...byId.values()].filter(p=>!hidden.has(p.id)).sort((a,b)=>(b.number||0)-(a.number||0));
  return{status:'ok',reason:'ok',items,hiddenKnown:h.status==='ok'};
}

// Resolves "build prompt 6" (by number) or "run my saved prompt about X" (by meaning) to a saved prompt.
const NUM_RE=/\bprompt\s*(?:#|number|no\.?)?\s*(\d{1,4})\b/i;
const TRIGGER_RE=/\b(my (saved|own) prompts?|from my (memory|prompt library|prompts?|library)|my prompt library)\b/i;
async function resolvePrompt(sub,message){
  const text=String(message||'');
  const num=text.match(NUM_RE);
  if(num){
    const all=await loadPrompts(sub,'',200);
    if(all.status!=='ok')return{requestedNumber:num[1],item:null,unavailable:true};
    const item=all.items.find(p=>String(p.number)===num[1])||null;
    return{requestedNumber:num[1],item};
  }
  if(TRIGGER_RE.test(text)){
    const r=await M.recallNs(pns(sub),text,3);
    if(r.status==='ok'&&r.items.length){
      const p=unpack(r.items[0].text);
      if(p)return{item:p};
    }
  }
  return{item:null};
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to use your prompt library on Walrus.'});

  if(req.method==='GET'){
    const q=oneLine(req.query&&req.query.q,200);
    const r=await loadPrompts(s.sub,q,q?20:60);
    return res.json(r);
  }

  if(req.method!=='POST')return res.status(405).end();
  if(limited(s.sub))return res.status(429).json({error:'Too many saves in a short time. Wait a few minutes and try again.'});
  const b=req.body||{};

  if(b.action==='hide'){
    const id=String(b.id||'');
    if(!ID_RE.test(id))return res.status(400).json({error:'Unknown prompt.'});
    const w=await M.rememberNs(hns(s.sub),'ID: '+id+'\nHidden: '+new Date().toISOString());
    if(w.status==='unavailable')return res.status(502).json({error:'Could not reach Walrus to hide this prompt. It is hidden on this device only.',reason:w.reason});
    return res.json({ok:true,status:w.status});
  }

  if(b.action!=='save')return res.status(400).json({error:'Unknown action.'});
  const text=body(b.text,6000);
  if(text.length<20)return res.status(400).json({error:'The prompt is too short. Paste the full prompt text (at least 20 characters).'});
  if(M.hasKnownSecret(text))return res.status(400).json({error:'This looks like it contains a key or token. Remove it and try again.'});
  const id=crypto.randomBytes(6).toString('hex');
  const hash=crypto.createHash('sha256').update(text.toLowerCase().replace(/\s+/g,' ')).digest('hex').slice(0,16);
  const [existing,title]=await Promise.all([loadPrompts(s.sub,'',200),nameWithGemini(text)]);
  const number=(existing.status==='ok'&&existing.items.length?Math.max(...existing.items.map(p=>p.number||0)):0)+1;
  const item={id,number,title:oneLine(b.title,60)||title,savedAt:new Date().toISOString(),hash,text};
  const w=await M.rememberNs(pns(s.sub),pack(item));
  if(w.status==='rejected')return res.status(400).json({error:'This looks like it contains a key or token. Remove it and try again.'});
  if(w.status==='unavailable')return res.status(502).json({error:'Could not reach Walrus right now. Your prompt is kept on this device and can be synced later.',reason:w.reason});
  return res.json({ok:true,status:w.status,item});
};
module.exports.pack=pack;module.exports.unpack=unpack;
module.exports.loadPrompts=loadPrompts;module.exports.resolvePrompt=resolvePrompt;
