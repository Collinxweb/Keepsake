const L=require('../_lib');
module.exports=async(req,res)=>{
  const{code,state}=req.query,n=L.cookies(req).ks_n;
  const fail=()=>{res.writeHead(302,{Location:'/?login=failed'});res.end()};
  if(!code||!state||state!==n)return fail();
  try{
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID||'',client_secret:process.env.GOOGLE_CLIENT_SECRET||'',redirect_uri:L.BASE+'/api/auth/callback',grant_type:'authorization_code'})});
    const t=await r.json();if(!t.id_token)return fail();
    const p=JSON.parse(Buffer.from(t.id_token.split('.')[1],'base64url'));
    L.setC(res,'ks_s',L.sign({sub:p.sub,name:p.name||p.email,email:p.email,exp:Date.now()+6048e5}),604800);
    L.setC(res,'ks_n','',0);
    res.writeHead(302,{Location:'/'});res.end();
  }catch(e){fail()}
};
