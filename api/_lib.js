const c=require('crypto');
const S=()=>process.env.SESSION_SECRET||'';
const key=()=>c.createHash('sha256').update('k:'+S()).digest();
const b64=b=>Buffer.from(b).toString('base64url');
const L=exports;
L.BASE=process.env.BASE_URL||'https://keepsake-lake.vercel.app';
L.sign=o=>{const p=b64(JSON.stringify(o));return p+'.'+c.createHmac('sha256',S()).update(p).digest('base64url')};
L.verify=t=>{if(!t||!S())return null;const[i,m]=t.split('.');if(!m)return null;const e=c.createHmac('sha256',S()).update(i).digest('base64url');if(e.length!==m.length||!c.timingSafeEqual(Buffer.from(e),Buffer.from(m)))return null;try{const o=JSON.parse(Buffer.from(i,'base64url'));return o.exp>Date.now()?o:null}catch{return null}};
L.enc=s=>{const iv=c.randomBytes(12),x=c.createCipheriv('aes-256-gcm',key(),iv),d=Buffer.concat([x.update(s,'utf8'),x.final()]);return b64(Buffer.concat([iv,x.getAuthTag(),d]))};
L.dec=t=>{try{const b=Buffer.from(t,'base64url'),x=c.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));x.setAuthTag(b.subarray(12,28));return Buffer.concat([x.update(b.subarray(28)),x.final()]).toString('utf8')}catch{return null}};
L.cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i).trim(),s.slice(i+1).trim()]}));
L.setC=(res,n,v,age)=>{const a=[].concat(res.getHeader('Set-Cookie')||[]);a.push(`${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);res.setHeader('Set-Cookie',a)};
L.session=req=>L.verify(L.cookies(req).ks_s);
// The agent key lives only in an encrypted, HttpOnly cookie bound to the logged-in user.
L.agent=(req,s)=>{const t=L.cookies(req).ks_a;const j=t&&L.dec(t);if(!j)return null;try{const a=JSON.parse(j);return a.sub===s.sub?a:null}catch{return null}};
