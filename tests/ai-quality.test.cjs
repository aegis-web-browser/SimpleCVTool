'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
process.env.SUPABASE_URL='https://supabase.mock.invalid';
process.env.SUPABASE_ANON_KEY='public-unit-test';
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_unit_test';
process.env.GROQ_API_KEY='gsk_unit_test_only';
process.env.APP_URL='http://127.0.0.1:5500';
const capture=[];
let groqReplies=[];
let groqFailures=[];
let groqRawResponses=[];
let refunds=0;
let reservations=0;
globalThis.fetch=async(url,opts={})=>{
 const path=String(url), body=opts.body?JSON.parse(opts.body):{};
 if(path.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'test-user'}),{status:200});
 if(path.includes('rpc/reserve_ai_use')){reservations++;return new Response(JSON.stringify({allowed:true,plan:'free',remaining:0}),{status:200})}
 if(path.includes('rpc/refund_ai_use')){refunds++;return new Response('null',{status:200})}
 if(path.includes('api.groq.com/openai/v1/chat/completions')){
  capture.push(body);
  if(groqFailures.length){const err=groqFailures.shift();return new Response(JSON.stringify({error:{message:err.message||'Failed to generate JSON. Please adjust your prompt.',code:err.code||'json_validate_failed'}}),{status:err.status||400});}
  const content=groqRawResponses.length?groqRawResponses.shift():JSON.stringify(groqReplies.length?groqReplies.shift():{title:'CV — communication',person:{name:'Marie Martin'},sections:[{type:'profile',title:'Profil',text:'Coordination de projets de communication.'}]});
  return new Response(JSON.stringify({choices:[{message:{content}}],usage:{total_tokens:110}}),{status:200});
 }
 return new Response('{}',{status:404});
};
const {app}=require('../server/index.cjs');
let port;
test.before(async()=>{await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));port=app.address().port});
test.after(async()=>{await new Promise(resolve=>app.close(resolve))});
function run(body){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/api/ai',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'}},res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(s)}));});req.on('error',reject);req.end(JSON.stringify(body))})}
test('génération enrichie, style complet par défaut et données professionnelles vérifiées',async()=>{
 const r=await run({mode:'generate',prompt:'Marie Martin. Chargée de communication. Coordination de campagne, rédaction de contenus, suivi des partenaires.'});
 assert.equal(r.status,200);assert.ok(r.body.cv.sections.length>0);
 const req=capture.at(-1);assert.equal(req.model,'openai/gpt-oss-20b');assert.equal(req.response_format.type,'json_schema');assert.equal(req.response_format.json_schema.strict,true);
 assert.equal(req.response_format.json_schema.schema.additionalProperties,false);
 assert.equal(req.response_format.json_schema.schema.properties.sections.items.additionalProperties,false);
 assert.match(req.messages[0].content,/ne jamais inventer/i);assert.match(req.messages[1].content,/3 à 6 puces/);
 assert.ok(req.max_completion_tokens>=4000);
});
test('amélioration ne transmet jamais la photo ou le style de CV au fournisseur IA',async()=>{
 groqReplies=[{title:'CV — communication',person:{name:'Marie Martin'},sections:[{type:'experience',title:'Expériences professionnelles',items:[{title:'Chargée de communication',organization:'Entreprise Alpha',text:'- Rédaction de contenus\n- Suivi de campagnes\n- Coordination des projets'}]}]}];
 const r=await run({mode:'improve',detail:'detailed',cv:{title:'CV',style:{paperColor:'#111111'},person:{name:'Marie Martin',role:'Communication',photo:'data:image/jpeg;base64,VERYPRIVATEPHOTO'},sections:[{type:'experience',title:'Expérience',text:'',items:[{title:'Chargée de communication',organization:'Entreprise Alpha',text:'Rédaction, suivi de campagnes, coordination'}]}]}});
 assert.equal(r.status,200);
 const req=capture.at(-1),payload=req.messages[1].content;
 assert.match(payload,/3 à 5 puces/);assert.doesNotMatch(payload,/VERYPRIVATEPHOTO|paperColor/);
 assert.match(payload,/Entreprise Alpha/);assert.match(payload,/suivi de campagnes/);
});

test('un CV partiel renvoyé par Groq est accepté sans relance ni quota supplémentaire',async()=>{
 const before=capture.length,beforeReservations=reservations,beforeRefunds=refunds;
 groqReplies=[{title:'CV — communication',person:{name:'Camille Laurent'},sections:[{type:'profile',title:'Profil',text:'Communication digitale'}]}];
 const res=await run({mode:'generate',detail:'balanced',prompt:'Camille Laurent, communication digitale. 2023-2026 Studio Horizon, licence en 2021, maîtrise de Canva et anglais.'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(capture.length-before,1,'une seule requête Groq, sans relance coûteuse');
 assert.equal(reservations-beforeReservations,1);
 assert.equal(refunds-beforeRefunds,0);
 assert.deepEqual(res.body.cv.sections.map(s=>s.type),['profile']);
});

test('des notes brèves restent acceptées même sans formations ni expériences',async()=>{
 const before=capture.length;
 groqReplies=[{title:'CV — Étudiant',person:{name:'Alex'},sections:[{type:'skills',title:'Compétences',text:'Esprit d’équipe'}]}];
 const res=await run({mode:'generate',detail:'concise',prompt:'Alex, étudiant'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(capture.length-before,1);
 assert.equal(res.body.cv.sections[0].type,'skills');
});
test('une réponse sans rubriques reçoit un profil minimal au lieu de bloquer',async()=>{
 groqReplies=[{title:'CV',person:{name:'Alex'},sections:[]}];
 const res=await run({mode:'generate',prompt:'Étudiant motivé'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(res.body.cv.sections.length,1);
 assert.equal(res.body.cv.sections[0].type,'profile');
 assert.equal(res.body.cv.sections[0].text,'Étudiant motivé');
});

test('une erreur Groq JSON HTTP 400 déclenche un unique repli sans JSON forcé',async()=>{
 const before=capture.length,beforeReservations=reservations,beforeRefunds=refunds;
 groqFailures=[{status:400,message:'Failed to generate JSON. Please adjust your prompt.'}];
 groqReplies=[{title:'CV — communication',person:{name:'Camille Laurent'},sections:[{type:'profile',title:'Profil',text:'Communication digitale'}]}];
 const res=await run({mode:'generate',prompt:'Camille travaille dans la communication digitale et la rédaction.'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(capture.length-before,2);
 assert.equal(capture.at(-2).response_format.type,'json_schema');
 assert.equal(capture.at(-1).response_format,undefined);
 assert.equal(reservations-beforeReservations,1);
 assert.equal(refunds-beforeRefunds,0);
 assert.equal(res.body.cv.sections.length,1);
});
test('une sortie JSON mal formée est réparée au second essai sans décompte supplémentaire',async()=>{
 const before=capture.length;
 groqRawResponses=['{invalid', '```json\n{"title":"CV","person":{"name":"Camille"},"sections":[{"type":"skills","text":"- Travail d’équipe","items":[]}]}\n```'];
 const res=await run({mode:'generate',prompt:'Camille sait travailler en équipe.'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(capture.length-before,2);
 assert.equal(res.body.cv.sections[0].type,'skills');
});
test('un vrai quota Groq HTTP 429 donne une explication distincte et rembourse l’utilisation',async()=>{
 const before=capture.length,beforeRefunds=refunds;
 groqFailures=[{status:429,message:'Rate limit exceeded'}];
 const res=await run({mode:'generate',prompt:'Camille est chargée de communication.'});
 assert.equal(res.status,429);
 assert.equal(capture.length-before,1);
 assert.equal(refunds-beforeRefunds,1);
 assert.match(res.body.error,/temporairement saturé|quota/i);
 assert.doesNotMatch(res.body.error,/Failed to generate JSON|See.failed_generation/i);
});
test('un échec de deux sorties JSON est expliqué en français et ne consomme pas le forfait',async()=>{
 const before=capture.length,beforeRefunds=refunds;
 groqRawResponses=['[malformed','{still invalid'];
 const res=await run({mode:'generate',prompt:'Camille est graphiste et travaille sur des affiches.'});
 assert.equal(res.status,502);
 assert.equal(capture.length-before,2);
 assert.equal(refunds-beforeRefunds,1);
 assert.match(res.body.error,/génération IA|format/i);
 assert.doesNotMatch(res.body.error,/Failed to generate JSON|failed_generation/i);
});
test('une clé Groq rejetée ne déclenche pas un second appel',async()=>{
 const before=capture.length,beforeRefunds=refunds;
 groqFailures=[{status:401,message:'Invalid API key'}];
 const res=await run({mode:'generate',prompt:'Camille est graphiste et travaille sur des affiches.'});
 assert.equal(res.status,503);
 assert.equal(capture.length-before,1);
 assert.equal(refunds-beforeRefunds,1);
 assert.match(res.body.error,/administrateur/i);
 assert.doesNotMatch(res.body.error,/Invalid API key/);
});