const L=require('../../_lib');
module.exports=async(req,res)=>{
  const{code,state,error}=req.query,n=L.cookies(req).ks_n;
  const fail=w=>{res.writeHead(302,{Location:'/?login=failed&why='+encodeURIComponent(String(w).replace(/[^a-z_]/gi,'').slice(0,40))});res.end()};
  if(!process.env.SESSION_SECRET)return fail('no_session_secret');
  if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_CLIENT_SECRET)return fail('missing_discord_env');
  if(error)return fail('discord_'+error);
  if(!code||!state)return fail('no_code');
  if(!n)return fail('state_cookie_missing');
  if(state!==n)return fail('state_mismatch');
  try{
    const r=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:L.BASE+'/api/auth/discord/callback'})});
    const t=await r.json();if(!t.access_token)return fail(t.error||'no_access_token');
    const u=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+t.access_token}});
    const p=await u.json();if(!p||!p.id)return fail('no_discord_user');
    L.setC(res,'ks_s',L.sign({sub:'discord:'+p.id,name:p.global_name||p.username,email:'',exp:Date.now()+6048e5}),604800);
    L.setC(res,'ks_n','',0);
    res.writeHead(302,{Location:'/'});res.end();
  }catch(e){fail('exception')}
};
