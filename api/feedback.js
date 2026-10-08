const L=require('./_lib');
// Public feedback stored as GitHub issues labelled "feedback". Reading is public; posting needs a login.
const REPO=process.env.FEEDBACK_REPO||'Collinxweb/Keepsake';
const BASE={Accept:'application/vnd.github+json','User-Agent':'keepsake','X-GitHub-Api-Version':'2022-11-28'};
const cap=(v,n)=>String(v==null?'':v).trim().slice(0,n);
const WORKED=['Yes','No','Partly'];
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    const h={...BASE};if(process.env.FEEDBACK_GITHUB_TOKEN)h.Authorization='Bearer '+process.env.FEEDBACK_GITHUB_TOKEN;
    try{
      const r=await fetch(`https://api.github.com/repos/${REPO}/issues?labels=feedback&state=all&per_page=50`,{headers:h});
      if(!r.ok)return res.status(502).json({error:'Feedback is temporarily unavailable.'});
      const list=await r.json();
      return res.json({items:list.filter(i=>!i.pull_request).map(i=>({number:i.number,title:i.title,body:i.body||'',created_at:i.created_at,url:i.html_url}))});
    }catch(e){return res.status(502).json({error:'Feedback is temporarily unavailable.'})}
  }
  if(req.method!=='POST')return res.status(405).end();
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to post feedback. You can still read everyone\'s feedback.'});
  const token=process.env.FEEDBACK_GITHUB_TOKEN;
  if(!token)return res.status(503).json({error:'Feedback is temporarily unavailable.'});
  const b=req.body||{};
  const f={feature:cap(b.feature,40),provider:cap(b.provider,40),model:cap(b.model,80),tested:cap(b.tested,1000),expected:cap(b.expected,1000),actual:cap(b.actual,1000),worked:WORKED.includes(b.worked)?b.worked:'',feedback:cap(b.feedback,2000),bug:cap(b.bug,1000),improvement:cap(b.improvement,1000)};
  if(!f.feature||!f.tested||!f.worked||!f.feedback)return res.status(400).json({error:'Fill in feature, what you tested, whether it worked, and your feedback.'});
  const date=new Date().toISOString().slice(0,10);
  const name=cap(s.name,60)||'Tester';
  const title=`[${f.worked}] ${f.feature}: ${f.tested.slice(0,60)}`;
  const body=[
    `**Tester:** ${name}`,`**Date:** ${date}`,`**Feature tested:** ${f.feature}`,
    `**Provider:** ${f.provider||'-'}`,`**Model:** ${f.model||'-'}`,`**What was tested:** ${f.tested}`,
    `**Expected result:** ${f.expected||'-'}`,`**Actual result:** ${f.actual||'-'}`,`**Worked?** ${f.worked}`,
    `**Feedback:** ${f.feedback}`,`**Bug:** ${f.bug||'None reported'}`,`**Suggested improvement:** ${f.improvement||'None'}`
  ].join('\n\n');
  try{
    const r=await fetch(`https://api.github.com/repos/${REPO}/issues`,{method:'POST',headers:{...BASE,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({title,body,labels:['feedback']})});
    if(!r.ok){console.error('feedback_post',r.status);return res.status(502).json({error:'Could not post feedback right now. Try again.'})}
    const i=await r.json();
    res.json({ok:true,url:i.html_url});
  }catch(e){console.error('feedback_post','exception');res.status(502).json({error:'Could not post feedback right now. Try again.'})}
};
