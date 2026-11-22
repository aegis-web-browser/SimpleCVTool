'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
process.env.SUPABASE_URL='https://supabase.mock.invalid';
process.env.SUPABASE_ANON_KEY='public-unit-test';
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_unit_test';
process.env.GROQ_API_KEY='gsk_unit_test_only';
process.env.APP_URL='http://127.0.0.1:5500';
const capture=[];
let groqReplies=[];
let refunds=0;
let reservations=0;
globalThis.fetch=async(url,opts={})=>{
 const path=String(url), body=opts.body?JSON.parse(opts.body):{};
 if(path.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'test-user'}),{status:200});
 if(path.includes('rpc/reserve_ai_use')){reservations++;return new Response(JSON.stringify({allowed:true,plan:'free',remaining:0}),{status:200})}
 if(path.includes('rpc/refund_ai_use')){refunds++;return new Response('null',{status:200})}
 if(path.includes('api.groq.com/openai/v1/chat/completions')){
  capture.push(body);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(groqReplies.length?groqReplies.shift():{title:'CV — communication',person:{name:'Marie Martin'},sections:[{type:'profile',title:'Profil',text:'Coordination de projets de communication.'}]})}}],usage:{total_tokens:110}}),{status:200});
 }
 return new Response('{}',{status:404});
};
const {app}=require('../server/index.cjs');
let port;
test.before(async()=>{await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));port=app.address().port});
test.after(async()=>{await new Promise(resolve=>app.close(resolve))});
function run(body){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/api/ai',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'}},res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(s)}));});req.on('error',reject);req.end(JSON.stringify(body))})}
test('génération enrichie, style équilibré par défaut et données professionnelles vérifiées',async()=>{
 const r=await run({mode:'generate',prompt:'Marie Martin. Chargée de communication. Coordination de campagne, rédaction de contenus, suivi des partenaires.'});
 assert.equal(r.status,200);assert.ok(r.body.cv.sections.length>0);
 const req=capture.at(-1);assert.equal(req.model,'openai/gpt-oss-20b');assert.equal(req.response_format.type,'json_object');
 assert.match(req.messages[0].content,/ne jamais inventer/i);assert.match(req.messages[1].content,/2 à 4 puces/);
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

test('une description complète conserve toutes les rubriques, dates et employeurs après une relance de Groq',async()=>{
 const before=capture.length,beforeReservations=reservations,beforeRefunds=refunds;
 groqReplies=[
  {title:'CV — communication',person:{name:'Camille Laurent'},sections:[{type:'profile',title:'Profil',text:'Communication digitale'}]},
  {title:'CV — communication',person:{name:'Camille Laurent',role:'Chargée de communication digitale'},sections:[
   {type:'profile',title:'Profil',text:'Chargée de communication digitale, spécialisée en campagnes et contenus.'},
   {type:'experience',title:'Expériences professionnelles',items:[
    {title:'Chargée de communication',organization:'Studio Horizon',start:'2023',end:'2026',text:'- Pilotage de la présence en ligne\n- Engagement accru de 35 %'},
    {title:'Assistante communication',organization:'Agence Lumière',start:'2021',end:'2022',text:'- Rédaction de newsletters'}]},
   {type:'education',title:'Formation',items:[{title:'Master Communication',organization:'Université Lyon 2',start:'2021',text:''},{title:'Licence Information',organization:'Université Grenoble',start:'2019',text:''}]},
   {type:'skills',title:'Compétences',text:'- SEO\n- Stratégie éditoriale'},
   {type:'tools',title:'Outils et logiciels',text:'- Canva\n- WordPress\n- Google Analytics'},
   {type:'languages',title:'Langues',text:'- Français\n- Anglais C1'},
   {type:'interests',title:'Centres d’intérêt',text:'- Photographie'}]}
 ];
 const res=await run({mode:'generate',detail:'balanced',prompt:'Camille Laurent, chargée de communication digitale à Lyon. 2023-2026 Studio Horizon gestion réseaux sociaux engagement +35%. 2021-2022 Agence Lumière newsletters. Diplômes: master Université Lyon 2 en 2021, licence Université Grenoble en 2019. Logiciels: Canva, WordPress, Google Analytics. Compétences SEO et stratégie éditoriale. Langues Français, Anglais C1. Centres d’intérêt: photographie.'});
 assert.equal(res.status,200,JSON.stringify(res.body));
 assert.equal(capture.length-before,2,'le CV incomplet a déclenché une relance');
 assert.equal(reservations-beforeReservations,1,'une seule utilisation de quota débitée');
 assert.equal(refunds-beforeRefunds,0);
 for(const kind of ['experience','education','tools','skills','languages','interests'])assert.ok(res.body.cv.sections.some(s=>s.type===kind),kind);
 assert.equal(res.body.cv.sections.find(s=>s.type==='experience').items.length,2);
 assert.equal(res.body.cv.sections.find(s=>s.type==='education').items.length,2);
 assert.match(capture.at(-1).messages.at(-1).content,/oublié les rubriques/i);
});
test('un résultat incomplet deux fois de suite est refusé et ne consomme pas le quota',async()=>{
 const before=refunds;
 groqReplies=Array.from({length:2},()=>({person:{name:'Test'},sections:[{type:'profile',text:'Un CV vide'}]}));
 const res=await run({mode:'generate',prompt:'Titulaire du master en 2021 à Université Lyon 2 et licence 2019 à Université Grenoble. Logiciels : Canva et WordPress. Expérience 2023–2026 au Studio Horizon.'});
 assert.equal(res.status,502);
 assert.ok(refunds>before);
 assert.match(res.body.error,/omission|omis|informations importantes/i);
});
