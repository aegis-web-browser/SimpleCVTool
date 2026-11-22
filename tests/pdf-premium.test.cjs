'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
process.env.SUPABASE_URL='https://supabase.example';process.env.SUPABASE_ANON_KEY='public-placeholder';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_unit_test';process.env.GROQ_API_KEY='gsk_test_dummy';
let paid=false,reserved=0,modelCalls=[];
global.fetch=async(url,options={})=>{
 const u=String(url);let body={},status=200;
 if(u.endsWith('/auth/v1/user'))body={id:'test-user',email:'test@example.fr'};
 else if(u.includes('/entitlements?'))body=[{plan:paid?'promo':'free',free_ai_used:0}];
 else if(u.includes('/rpc/reserve_ai_use')){reserved++;body={allowed:true,plan:paid?'promo':'free',remaining:19}}
 else if(u.includes('/rpc/refund_ai_use'))body=null;
 else if(u.includes('api.groq.com')){
  const data=JSON.parse(options.body);modelCalls.push(data.model);
  const content=data.model==='qwen/qwen3.8-27b'?'Camille Laurent. Directrice de communication. 2022-2026. Université de Paris.':JSON.stringify({title:'CV — Camille Laurent',person:{name:'Camille Laurent'},sections:[{type:'experience',title:'Expériences professionnelles',text:'',items:[{title:'Directrice communication',organization:'Studio',text:'Coordination',start:'2022',end:'2026'}]}]});
  body={choices:[{message:{content},finish_reason:'stop'}],usage:{total_tokens:100}};
 }
 else {status=404;body={message:'Mock not found'}}
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
};
const {app}=require('../server/index.cjs');let port;
before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));port=app.address().port});
after(async()=>{await new Promise(r=>app.close(r))});
async function post(body){return new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port,path:'/api/ai',method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'}},response=>{let content='';response.on('data',x=>content+=x);response.on('end',()=>resolve({status:response.statusCode,json:JSON.parse(content)}))});request.on('error',reject);request.end(JSON.stringify(body))})}
test('un compte gratuit ne peut pas contourner Premium pour importer un CV PDF',async()=>{
 paid=false;const beforeReserved=reserved;
 const response=await post({mode:'pdf_import',prompt:'Camille Laurent directrice communication 2022-2026.'});
 assert.equal(response.status,403);assert.equal(reserved,beforeReserved);assert.match(response.json.error,/Premium/);
});
test('import d’un PDF textuel : une seule utilisation IA et modèle généré',async()=>{
 paid=true;modelCalls=[];const beforeReserved=reserved;
 const response=await post({mode:'pdf_import',prompt:'Camille Laurent, directrice de communication. De 2022 à 2026 chez Studio. Université.'});
 assert.equal(response.status,200,JSON.stringify(response.json));
 assert.equal(reserved,beforeReserved+1);assert.equal(modelCalls.length,1);assert.ok(response.json.cv.sections.some(x=>x.type==='experience'));
});
test('import PDF scanné : OCR visuel avant conversion, une seule utilisation du forfait',async()=>{
 paid=true;modelCalls=[];const beforeReserved=reserved;
 const response=await post({mode:'pdf_import',prompt:'',images:['data:image/jpeg;base64,AAAA']});
 assert.equal(response.status,200,JSON.stringify(response.json));
 assert.deepEqual(modelCalls,['qwen/qwen3.8-27b','openai/gpt-oss-20b']);assert.equal(reserved,beforeReserved+1);
});
