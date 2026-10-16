const L=require('../lib/_lib');
const M=require('../lib/_memory');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  // Health is public: it reports only a status code, never credentials.
  if(req.query&&req.query.health)return res.json(await M.health());
  const s=L.session(req);
  if(!s)return res.status(401).json({error:'Log in to see your memory.'});
  // Warm-up: the app calls this after login so the first chat message does not wait for Walrus.
  if(req.query&&req.query.warm){const r=await M.recallForChat(s.sub);return res.json({status:r.status,cached:!!r.cached});}
  const q=String((req.query&&req.query.q)||'preferences facts goals decisions projects').slice(0,200);
  const r=await M.recall(s.sub,q,50);
  res.json({status:r.status,reason:r.reason,items:r.items});
};
