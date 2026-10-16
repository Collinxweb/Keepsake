const L=require('../../_lib'),c=require('crypto');
module.exports=(req,res)=>{
  const n=c.randomBytes(16).toString('hex');
  L.setC(res,'ks_n',n,600);
  const u=new URL('https://github.com/login/oauth/authorize');
  u.search=new URLSearchParams({client_id:process.env.GITHUB_CLIENT_ID||'',redirect_uri:L.BASE+'/api/auth/github/callback',scope:'read:user',state:n,allow_signup:'true'});
  res.writeHead(302,{Location:u.toString()});res.end();
};
