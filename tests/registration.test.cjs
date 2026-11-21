'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
process.env.SUPABASE_URL='https://supabase.invalid';
process.env.SUPABASE_ANON_KEY='local-test-public-key';
const TEST_SECRET=['sb','secret','dummy_test_never_deploy'].join('_');
process.env.SUPABASE_SERVICE_ROLE_KEY=TEST_SECRET;
process.env.APP_URL='http://localhost:5500';
const calls=[];
global.fetch=async (url,options={})=>{
  calls.push({url:String(url),headers:options.headers,body:JSON.parse(options.body||'{}')});
  if(String(url).endsWith('/auth/v1/admin/users')) return new Response(JSON.stringify({id:'test-user-id'}),{status:200});
  if(String(url).includes('/auth/v1/token?grant_type=password'))return new Response(JSON.stringify({access_token:'test-session',refresh_token:'test-refresh',user:{id:'test-user-id',email:'exemple@example.com'}}),{status:200});
  return new Response('{}',{status:404});
};
const {app}=require('../server/index.cjs');
let port;
test.before(async()=>{await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));port=app.address().port});
test.after(async()=>{await new Promise((resolve,reject)=>app.close(e=>e?reject(e):resolve()))});
function post(body,headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:'/api/auth/register',method:'POST',headers:{'Content-Type':'application/json',...headers}},res=>{
    let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(data)})}catch(e){reject(e)}})
  });req.on('error',reject);req.end(JSON.stringify(body))
 });
}
test('inscription sans courriel : Supabase confirme le nouveau compte et retourne une session',async()=>{
 const r=await post({email:'Exemple@Example.com',password:'mot-de-passe-123456'});
 assert.equal(r.status,201);
 assert.equal(r.body.access_token,'test-session');
 assert.equal(calls.length,2);
 assert.equal(calls[0].body.email,'exemple@example.com');
 assert.equal(calls[0].body.email_confirm,true);
 assert.equal(calls[0].headers.apikey,TEST_SECRET);
 assert.equal(calls[0].headers.Authorization,undefined);
 assert.equal(calls[1].body.email,'exemple@example.com');
});
test('une adresse e-mail invalide est rejetée avant toute création',async()=>{
 const count=calls.length;
 const r=await post({email:'non-valide',password:'mot-de-passe-123456'});
 assert.equal(r.status,400);assert.equal(calls.length,count);
});
test('une requête venant d’une autre origine est refusée',async()=>{
 const count=calls.length;
 const r=await post({email:'autre@example.com',password:'mot-de-passe-123456'},{Origin:'https://autre.example'});
 assert.equal(r.status,403);assert.equal(calls.length,count);
});
