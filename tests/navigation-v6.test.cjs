'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
async function loadAuthPage(page){
 let dest=null;
 const ctx={document:{body:{dataset:{page}}},SCV:{esc:x=>String(x)},Store:{resume:async()=>true,data:{cvs:[]}},location:{replace:u=>{dest=u}},structuredClone,setTimeout,clearTimeout,console,globalThis:null};
 ctx.globalThis=ctx;vm.runInNewContext(src,ctx);await new Promise(resolve=>setImmediate(resolve));return dest;
}
test('connexion : un compte connecté est redirigé vers Mes CV',async()=>assert.equal(await loadAuthPage('login'),'dashboard.html'));
test('inscription : un compte connecté est redirigé vers Mes CV',async()=>assert.equal(await loadAuthPage('register'),'dashboard.html'));
test('liens de navigation mis à jour selon la session et synchronisation entre onglets',()=>{
 assert.match(src,/link\.href=logged\?'compte\.html':'connexion\.html'/);
 assert.match(src,/addEventListener\('storage'/);
 assert.match(src,/e\.persisted\)location\.reload\(\)/);
 assert.match(src,/\['dashboard\.html','premium\.html','modeles\.html','compte\.html'\]\.includes\(next\)/);
});
test('réglage du niveau de détail transmis au modèle',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../editeur.html'),'utf8');
 assert.match(html,/id="aiDetail"/);assert.match(html,/value="balanced" selected/);
 assert.match(src,/cv:current,detail/);
});
