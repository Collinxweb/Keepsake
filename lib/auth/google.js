const L=require('../_lib'),c=require('crypto');
module.exports=(req,res)=>{
  const n=c.randomBytes(16).toString('hex');
  L.setC(res,'ks_n',n,600);
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',redirect_uri:L.BASE+'/api/auth/callback',response_type:'code',scope:'openid email profile',state:n,prompt:'select_account'});
  res.writeHead(302,{Location:u.toString()});res.end();
};
