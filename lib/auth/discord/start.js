const L=require('../../_lib'),c=require('crypto');
module.exports=(req,res)=>{
  const n=c.randomBytes(16).toString('hex');
  L.setC(res,'ks_n',n,600);
  const u=new URL('https://discord.com/oauth2/authorize');
  u.search=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID||'',redirect_uri:L.BASE+'/api/auth/discord/callback',response_type:'code',scope:'identify',state:n,prompt:'none'});
  res.writeHead(302,{Location:u.toString()});res.end();
};
