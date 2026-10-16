// One function for every sign-in route. vercel.json rewrites each public URL to this file with provider and action set.
const H={
  'google:start':require('../lib/auth/google'),
  'google:callback':require('../lib/auth/callback'),
  'github:start':require('../lib/auth/github/start'),
  'github:callback':require('../lib/auth/github/callback'),
  'discord:start':require('../lib/auth/discord/start'),
  'discord:callback':require('../lib/auth/discord/callback'),
};
module.exports=(req,res)=>{
  const h=H[String((req.query&&req.query.provider)||'')+':'+String((req.query&&req.query.action)||'')];
  if(!h)return res.status(404).json({error:'Not found.'});
  return h(req,res);
};
