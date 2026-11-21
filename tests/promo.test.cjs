'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
process.env.APP_URL='http://localhost:5500';
process.env.SUPABASE_URL='https://example.supabase.invalid';
process.env.SUPABASE_ANON_KEY='public-test';
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test_local_private';
process.env.OWNER_PREMIUM_CODE='ONLY-IN-TEST-NOT-THE-REAL-CODE';
const calls=[];
let plan='free';
global.fetch=async (url,options={})=>{
 const u=String(url),verb=options.method||'GET';calls.push({url:u,verb});
 let data={};
 if(u.includes('/auth/v1/user'))data={id:'user-123',email:'user@example.com'};
 else if(u.includes('/rest/v1/entitlements?')&&verb==='GET')data=[{user_id:'user-123',plan,access_until:null,free_ai_used:0}];
 else if(u.includes('/rest/v1/entitlements?')&&verb==='POST'){const b=JSON.parse(options.body);plan=b[0].plan;data=b;}
 else throw Error('Unexpected '+u);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
const {app}=require('../server/index.cjs');let port;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));port=app.address().port;});
test.after(async()=>{await new Promise(r=>app.close(r));});
async function post(path,body,auth){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer dummy-jwt'}:{})}},resp=>{let raw='';resp.on('data',c=>raw+=c);resp.on('end',()=>resolve({status:resp.statusCode,body:JSON.parse(raw)}))});req.on('error',reject);req.end(JSON.stringify(body));});}
test('activation interdite sans authentification',async()=>{const r=await post('/api/premium/redeem',{code:process.env.OWNER_PREMIUM_CODE},false);assert.equal(r.status,401);assert.equal(plan,'free')});
test('un code erroné ne donne aucun droit',async()=>{const r=await post('/api/premium/redeem',{code:'FAUX-SECURE'},true);assert.equal(r.status,400);assert.equal(plan,'free');assert.ok(!calls.some(x=>x.url.includes('on_conflict')))});
test('un code valide débloque Premium côté serveur pour le compte authentifié',async()=>{const r=await post('/api/premium/redeem',{code:process.env.OWNER_PREMIUM_CODE},true);assert.equal(r.status,200);assert.equal(r.body.plan,'promo');assert.equal(plan,'promo');assert.ok(calls.some(x=>x.verb==='POST'&&x.url.includes('entitlements')))});
test('une seconde validation ne redonne pas de droits superposés',async()=>{const count=calls.filter(x=>x.verb==='POST').length;const r=await post('/api/premium/redeem',{code:process.env.OWNER_PREMIUM_CODE},true);assert.equal(r.status,200);assert.equal(calls.filter(x=>x.verb==='POST').length,count)});
