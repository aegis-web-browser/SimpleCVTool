'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {app}=require('../server/index.cjs');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
let host;
test.before(async()=>{await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));host=`http://127.0.0.1:${app.address().port}`});
test.after(async()=>await new Promise(resolve=>app.close(resolve)));
test('site et pages publiques accessibles',async()=>{
 for(const route of ['/','/index.html','/connexion.html','/inscription.html','/modeles.html','/dashboard.html','/editeur.html','/premium.html','/compte.html','/mentions.html']){
  const r=await fetch(host+route);assert.equal(r.status,200,route);assert.match(r.headers.get('content-type'),/text\/html/);
 }
});
test('la configuration publique n’expose aucun secret',async()=>{
 const r=await fetch(host+'/api/public-config.js');assert.equal(r.status,200);
 const js=await r.text();assert.match(js,/SIMPLECV_PUBLIC/);
 for(const name of ['GROQ_API_KEY','STRIPE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])assert.equal(js.includes(name),false);
});
test('non authentifié : pas d’appel d’IA ni de paiement',async()=>{
 for(const route of ['/api/ai','/api/billing/checkout']){
  const r=await fetch(host+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.ok([401,503].includes(r.status),route+' returned '+r.status);
 }
});
test('aucune diffusion de fichiers secrets ou sources',async()=>{
 for(const route of ['/.env','/package.json','/server/index.cjs','/supabase/001_init.sql','/assets/../server/index.cjs']){
  const r=await fetch(host+route);assert.equal(r.status,404,route);
 }
});
test('30 modèles dont exactement 3 gratuits',()=>{
 const context={globalThis:{SCV:{esc:s=>s,rich:s=>s,safeURL:s=>s}},SCV:null};context.SCV=context.globalThis.SCV;
 const source=fs.readFileSync(path.resolve(__dirname,'../assets/templates.js'),'utf8');vm.runInNewContext(source,context);
 assert.equal(context.SCV.templates.length,30);assert.equal(context.SCV.templates.filter(x=>!x.premium).length,3);
 assert.deepEqual(Array.from(context.SCV.templates.filter(x=>!x.premium).map(x=>x.id)),[0,1,2]);
});
test('aucune ancienne clé ni backdoor dans les sources',()=>{
 const dir=path.resolve(__dirname,'..');const all=[];
 for(const folder of ['assets','server'])for(const n of fs.readdirSync(path.join(dir,folder)))if(/\.(?:cjs|js)$/.test(n))all.push(fs.readFileSync(path.join(dir,folder,n),'utf8'));
 const source=all.join('\n');assert.equal(/gsk_[A-Za-z0-9]{20,}/.test(source),false);
 assert.equal(source.includes('OWNER_BACKDOOR_CODE'),false);assert.equal(source.includes('SimpleCVLocalAI'),false);
});
