const L=require('../../_lib');
module.exports=async(req,res)=>{
  const{code,state}=req.query,n=L.cookies(req).ks_n;
  const fail=w=>{res.writeHead(302,{Location:'/?login=failed&why='+encodeURIComponent(String(w).replace(/[^a-z_]/gi,'').slice(0,40))});res.end()};
  if(!process.env.SESSION_SECRET)return fail('no_session_secret');
  if(!process.env.GITHUB_CLIENT_ID||!process.env.GITHUB_CLIENT_SECRET)return fail('missing_github_env');
  if(!code||!state)return fail('no_code');
  if(!n)return fail('state_cookie_missing');
  if(state!==n)return fail('state_mismatch');
  try{
    const r=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:L.BASE+'/api/auth/github/callback'})});
    const t=await r.json();if(!t.access_token)return fail(t.error||'no_access_token');
    const u=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t.access_token,Accept:'application/vnd.github+json','User-Agent':'keepsake'}});
    const p=await u.json();if(!p||!p.id)return fail('no_github_user');
    L.setC(res,'ks_s',L.sign({sub:'github:'+p.id,name:p.name||p.login,email:'',exp:Date.now()+6048e5}),604800);
    L.setC(res,'ks_n','',0);
    res.writeHead(302,{Location:'/'});res.end();
  }catch(e){fail('exception')}
};
