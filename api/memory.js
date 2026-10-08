const L=require('./_lib');
const M=require('./_memory');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to see your memory.'});
  if(req.query&&req.query.health)return res.json(await M.health());
  const q=String((req.query&&req.query.q)||'preferences facts goals decisions projects').slice(0,200);
  const r=await M.recall(s.sub,q,20);
  res.json({status:r.status,reason:r.reason,items:r.items});
};
