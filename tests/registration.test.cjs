'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const crypto=require('node:crypto');
process.env.SUPABASE_URL='https://supabase.invalid';
process.env.SUPABASE_ANON_KEY='local-test-public-key';
const TEST_SECRET=['sb','secret','dummy_test_never_deploy'].join('_');
process.env.SUPABASE_SERVICE_ROLE_KEY=TEST_SECRET;
process.env.APP_URL='http://localhost:5500';
const calls=[];
global.fetch=async (url,options={})=>{
 calls.push({url:String(url),headers:options.headers,body:JSON.parse(options.body||'{}')});
 if(String(url).endsWith('/auth/v1/admin/users'))return new Response(JSON.stringify({id:'test-user-id'}),{status:200});
 if(String(url).includes('/auth/v1/token?grant_type=password'))return new Response(JSON.stringify({access_token:'test-session',refresh_token:'test-refresh',user:{id:'test-user-id',email:'exemple@example.com'}}),{status:200});
 return new Response('{}',{status:404});
};
const {app}=require('../server/index.cjs');
let port;
test.before(async()=>{await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));port=app.address().port});
test.after(async()=>{await new Promise((resolve,reject)=>app.close(e=>e?reject(e):resolve()))});
function request(path,body,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers}},res=>{
   let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(data)})}catch(e){reject(e)}})
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
async function solveCaptcha(){
 const orig=crypto.randomInt;
 let r;
 try{crypto.randomInt=()=>0;r=await request('/api/auth/captcha')}finally{crypto.randomInt=orig}
 assert.equal(r.status,200);
 assert.match(r.body.image,/^data:image\/svg\+xml;base64,/);
 const svg=Buffer.from(r.body.image.split(',')[1],'base64').toString('utf8');
 assert.ok(svg.includes('<path'));assert.ok(!svg.includes('<text'));
 return {captchaId:r.body.captchaId,captchaAnswer:'AAAAA'};
}
test('CAPTCHA absent et incorrect bloquent la création avant Supabase',async()=>{
 const count=calls.length;
 const none=await request('/api/auth/register',{email:'e@example.com',password:'mot-de-passe-123456'});
 assert.equal(none.status,400);
 const challenge=await solveCaptcha();
 const wrong=await request('/api/auth/register',{email:'e@example.com',password:'mot-de-passe-123456',...challenge,captchaAnswer:'BBBBB'});
 assert.equal(wrong.status,400);
 assert.equal(calls.length,count);
});
test('inscription directe après CAPTCHA : aucun lien de confirmation',async()=>{
 const challenge=await solveCaptcha();
 const r=await request('/api/auth/register',{email:'Exemple@Example.com',password:'mot-de-passe-123456',...challenge});
 assert.equal(r.status,201);
 assert.equal(r.body.access_token,'test-session');
 assert.equal(calls.length,2);
 assert.ok(calls[0].url.endsWith('/auth/v1/admin/users'));
 assert.equal(calls[0].body.email,'exemple@example.com');
 assert.equal(calls[0].body.email_confirm,true);
 assert.equal(calls[0].headers.apikey,TEST_SECRET);
 assert.equal(calls[0].headers.Authorization,undefined);
 assert.ok(!calls.some(x=>x.url.includes('/auth/v1/signup')));
 const replay=await request('/api/auth/register',{email:'e@example.com',password:'mot-de-passe-123456',...challenge});
 assert.equal(replay.status,400);
 assert.equal(calls.length,2);
});
test('adresse invalide rejetée sans créer de compte',async()=>{
 const count=calls.length;
 const r=await request('/api/auth/register',{email:'non-valide',password:'mot-de-passe-123456',...await solveCaptcha()});
 assert.equal(r.status,400);assert.equal(calls.length,count);
});
test('origine tierce refusée avant vérification CAPTCHA',async()=>{
 const count=calls.length;
 const r=await request('/api/auth/register',{email:'autre@example.com',password:'mot-de-passe-123456'},{Origin:'https://autre.example'});
 assert.equal(r.status,403);assert.equal(calls.length,count);
});
test('formulaire pot de miel : toute valeur est refusée',async()=>{
 const count=calls.length;
 const r=await request('/api/auth/register',{email:'autre@example.com',password:'mot-de-passe-123456',website:'https://spam.test',...await solveCaptcha()});
 assert.equal(r.status,400);assert.equal(calls.length,count);
});
