const L=require('./_lib');
module.exports=(req,res)=>{L.setC(res,'ks_s','',0);L.setC(res,'ks_a','',0);res.json({ok:true})};
