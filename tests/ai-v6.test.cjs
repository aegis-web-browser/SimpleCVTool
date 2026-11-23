'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
process.env.SUPABASE_URL='https://supabase.mock.invalid';
process.env.SUPABASE_ANON_KEY='public-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_unit_test';
process.env.GROQ_API_KEY='gsk_unit_test_only';
const capture=[];
globalThis.fetch=async(url,opts={})=>{
 const p=String(url);
 if(p.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'test-user'}));
 if(p.includes('rpc/reserve_ai_use'))return new Response(JSON.stringify({allowed:true,plan:'free',remaining:0}));
 if(p.includes('rpc/refund_ai_use'))return new Response('null');
 if(p.includes('api.groq.com/openai/v1/chat/completions')){capture.push(JSON.parse(opts.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'CV',person:{name:'Marie'},sections:[{type:'profile',title:'Profil',text:'Coordination de projets.'}]})}}]}));}
 return new Response('{}',{status:404});
};
const {app}=require('../server/index.cjs');let port;
test.before(async()=>{await new Promise(done=>app.listen(0,'127.0.0.1',done));port=app.address().port});
test.after(async()=>{await new Promise(done=>app.close(done))});
const request=body=>new Promise((done,fail)=>{const r=http.request({hostname:'127.0.0.1',port,path:'/api/ai',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test'}},res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>done({status:res.statusCode,data:JSON.parse(s)}))});r.on('error',fail);r.end(JSON.stringify(body))});
test('Groq développe les missions en style complet par défaut sans inventer de faits',async()=>{
 const r=await request({mode:'generate',prompt:'Marie, chargée de communication. Coordination de projets, rédaction de contenus et organisation de campagnes.'});assert.equal(r.status,200);
 const q=capture.at(-1);assert.equal(q.response_format.type,'json_object');assert.match(q.messages[0].content,/ne jamais inventer/i);assert.match(q.messages[1].content,/3 à 6 puces/);
});
test('l’amélioration n’envoie ni les photos ni les couleurs à Groq',async()=>{
 const r=await request({mode:'improve',detail:'detailed',cv:{style:{paperColor:'#112233'},person:{name:'Marie',role:'Communication',photo:'PRIVATE_IMAGE'},sections:[{type:'experience',text:'Coordination des communications',items:[{title:'Cheffe de projet',organization:'Studio Nord',text:'Campagnes'}]}]}});assert.equal(r.status,200);
 const msg=capture.at(-1).messages[1].content;assert.match(msg,/3 à 5 puces/);assert.doesNotMatch(msg,/PRIVATE_IMAGE|paperColor/);assert.match(msg,/Studio Nord/);
});
