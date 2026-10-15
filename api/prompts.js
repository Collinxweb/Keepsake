const crypto=require('crypto');
const L=require('./_lib');
const M=require('./_memory');
// Prompt library. Each prompt is one record in a per-account Walrus namespace that is separate from chat facts.
// Hidden ids go in a second namespace, because Walrus cannot delete yet.
const ID_RE=/^[a-f0-9]{12}$/;
const pns=sub=>M.ns(sub)+'-prompts';
const hns=sub=>M.ns(sub)+'-prompts-hidden';
const oneLine=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
const body=(v,n)=>String(v==null?'':v).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,n);
function cleanUrl(u){
  u=oneLine(u,300);if(!u)return'';
  try{const x=new URL(u);if(x.protocol!=='https:'||x.username||x.password)return null;return x.toString();}catch(e){return null;}
}
function pack(p){
  return['[Keepsake prompt]','ID: '+p.id,'Title: '+p.title,'Author: '+(p.author||'-'),'Source: '+(p.url||'-'),'Tags: '+(p.tags.join(', ')||'-'),'Saved: '+p.savedAt,'Hash: '+p.hash,'---',p.text].join('\n');
}
function unpack(t){
  const s=String(t);
  if(!s.startsWith('[Keepsake prompt]'))return null;
  const i=s.indexOf('\n---\n');if(i<0)return null;
  const head=s.slice(0,i),text=s.slice(i+5);
  const g=k=>{const m=head.match(new RegExp('^'+k+': (.*)$','m'));return m?m[1].trim():'';};
  const id=g('ID');if(!ID_RE.test(id))return null;
  const dash=v=>v==='-'?'':v;
  const tags=dash(g('Tags'));
  return{id,title:g('Title'),author:dash(g('Author')),url:dash(g('Source')),tags:tags?tags.split(',').map(x=>x.trim()).filter(Boolean):[],savedAt:g('Saved'),hash:g('Hash'),text};
}
const hits=new Map();
function limited(sub){const now=Date.now(),a=(hits.get(sub)||[]).filter(t=>now-t<600000);if(a.length>=30){hits.set(sub,a);return true;}a.push(now);hits.set(sub,a);if(hits.size>5000)hits.clear();return false;}
function autoTitle(text){const line=text.split('\n').map(x=>x.trim()).find(Boolean)||'Untitled prompt';return oneLine(line,60);}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to use your prompt library on Walrus.'});

  if(req.method==='GET'){
    const q=oneLine(req.query&&req.query.q,200);
    const [r,h]=await Promise.all([M.recallNs(pns(s.sub),q||'saved prompts',q?20:60),M.recallNs(hns(s.sub),'hidden prompt ids',100)]);
    if(r.status!=='ok')return res.json({status:r.status,reason:r.reason,items:[],hidden:[]});
    const hidden=new Set();
    for(const it of h.items){const m=String(it.text).match(/^ID: ([a-f0-9]{12})$/m);if(m)hidden.add(m[1]);}
    const byId=new Map();
    for(const it of r.items){const p=unpack(it.text);if(p&&!byId.has(p.id))byId.set(p.id,p);}
    const items=[...byId.values()].filter(p=>!hidden.has(p.id)).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
    return res.json({status:'ok',reason:'ok',items,hidden:[...hidden],hiddenKnown:h.status==='ok'});
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
  const url=cleanUrl(b.url);
  if(url===null)return res.status(400).json({error:'The source link must be a full https:// address.'});
  let author=oneLine(b.author,40);
  if(author){
    if(!/^@?[A-Za-z0-9_.-]{2,39}$/.test(author))return res.status(400).json({error:'Author should look like @name.'});
    if(author[0]!=='@')author='@'+author;
  }
  const rawTags=Array.isArray(b.tags)?b.tags:String(b.tags||'').split(',');
  const tags=[...new Set(rawTags.map(t=>oneLine(t,24)).filter(Boolean))].slice(0,5);
  const id=ID_RE.test(String(b.id||''))?String(b.id):crypto.randomBytes(6).toString('hex');
  const hash=crypto.createHash('sha256').update(text.toLowerCase().replace(/\s+/g,' ')).digest('hex').slice(0,16);
  const item={id,title:oneLine(b.title,120)||autoTitle(text),author,url,tags,savedAt:new Date().toISOString(),hash,text};
  const w=await M.rememberNs(pns(s.sub),pack(item));
  if(w.status==='rejected')return res.status(400).json({error:'This looks like it contains a key or token. Remove it and try again.'});
  if(w.status==='unavailable')return res.status(502).json({error:'Could not reach Walrus right now. Your prompt is kept on this device and can be synced later.',reason:w.reason});
  return res.json({ok:true,status:w.status,item});
};
module.exports.pack=pack;module.exports.unpack=unpack;
