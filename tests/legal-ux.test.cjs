'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('l’inscription exige une acceptation explicite des conditions',()=>{
 const html=read('inscription.html');
 assert.match(html,/id="acceptTerms"[^>]*type="checkbox"[^>]*required/);
 assert.match(html,/href="conditions\.html"/);
 assert.match(html,/href="mentions\.html"/);
 const store=read('assets/store.js');
 assert.match(store,/termsAccepted:true/);
 assert.match(store,/termsVersion:'2026-11-23'/);
 for(const backend of ['server/index.cjs','supabase/functions/simplecv-api/index.ts']){
  const source=read(backend);
  assert.match(source,/termsAccepted!==true/);
  assert.match(source,/terms_accepted_at/);
 }
});

test('la page de conditions reste accessible sur Cloudflare et sur Render',()=>{
 const build=read('scripts/build-cloudflare.cjs');
 const server=read('server/index.cjs');
 assert.match(build,/'conditions\.html'/);
 assert.match(server,/'\/conditions\.html'/);
 assert.match(read('conditions.html'),/Conditions d’utilisation/);
});

test('l’interface ne montre aucun nom de prestataire technique',()=>{
 const pages=['index.html','inscription.html','connexion.html','dashboard.html','editeur.html','modeles.html','premium.html','compte.html','mentions.html','conditions.html'];
 for(const page of pages){
  assert.doesNotMatch(read(page),/supabase|groq|onrender/i,'mention technique visible dans '+page);
 }
 assert.doesNotMatch(read('assets/app.js'),/Rédaction via Groq|Enregistré dans Supabase|transmis à Groq/i);
});

test('l’assistant propose une rédaction détaillée et laisse corriger les champs',()=>{
 const editor=read('editeur.html'),app=read('assets/app.js'),mapping=read('assets/ai.js');
 assert.match(editor,/<option value="detailed" selected>/);
 assert.match(editor,/aiFact-projects/);
 assert.match(editor,/aiFact-certifications/);
 assert.match(editor,/aiFact-volunteer/);
 assert.match(editor,/aiFact-achievements/);
 assert.match(app,/preserveExisting:operation==='improve'/);
 assert.match(mapping,/function preserveExisting/);
 assert.match(app,/switchTab\('content'\);drawFields/);
});
