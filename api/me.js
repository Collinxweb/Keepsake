const L=require('../lib/_lib');
const crypto=require('crypto');
module.exports=(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const s=L.session(req);if(!s)return res.status(401).json({user:null});
  const a=L.agent(req,s);
  // uid is an opaque id for keeping this account's local data apart on a shared device. It is not the login id.
  const uid=crypto.createHash('sha256').update('uid:'+String(s.sub)).digest('hex').slice(0,12);
  res.json({user:{name:s.name,email:s.email,uid},agent:a?{provider:a.provider,model:a.model}:null});
};
