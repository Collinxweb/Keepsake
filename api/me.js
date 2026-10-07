const L=require('./_lib');
module.exports=(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);if(!s)return res.status(401).json({user:null});
  const a=L.agent(req,s);
  res.json({user:{name:s.name,email:s.email},agent:a?{provider:a.provider,model:a.model}:null});
};
