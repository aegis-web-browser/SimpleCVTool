'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function simulate(page,logged){
 const elements=new Map(),redirects=[];
 const el=(selector)=>{if(!elements.has(selector))elements.set(selector,{
  innerHTML:'',textContent:'',hidden:false,href:'',value:'',dataset:{},style:{},clientWidth:794,scrollHeight:1123,
  classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null},closest(){return null}
 });return elements.get(selector)};
 const document={body:{dataset:{page},classList:{toggle(){}}},querySelector:el,querySelectorAll:()=>[],addEventListener(){},getElementById:id=>el('#'+id)};
 const location={search:'',href:page+'.html',replace(x){redirects.push(x)}};
 const context=vm.createContext({document,location,window:{addEventListener(){}},history:{replaceState(){}},
  sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},requestAnimationFrame:()=>{},setTimeout,clearTimeout,
  structuredClone,crypto:crypto.webcrypto,URLSearchParams,Date,console,
  Store:{async resume(){return logged},data:{cvs:[]},user:logged?'test@example.fr':'',async logout(){}},
  Account:{async refresh(){return {premium:false,plan:'free'}}}});
 for(const name of ['assets/data.js','assets/templates.js','assets/app.js']){
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name,timeout:2000});
 }
 await new Promise(resolve=>setTimeout(resolve,40));
 return {elements,redirects,error:el('#toast').textContent};
}
test('la galerie affiche 30 modèles pour un visiteur',async()=>{
 const x=await simulate('templates',false);
 assert.ok(!x.error.startsWith('Impossible d’ouvrir la page'),x.error);
 assert.equal((x.elements.get('#templateList').innerHTML.match(/class="template-card/g)||[]).length,30);
 assert.match(x.elements.get('#filters').innerHTML,/data-category/);
 assert.equal(x.redirects.length,0);
});
test('la galerie fonctionne également pour un compte connecté',async()=>{
 const x=await simulate('templates',true);
 assert.ok(!x.error.startsWith('Impossible d’ouvrir la page'),x.error);
 assert.equal((x.elements.get('#templateList').innerHTML.match(/class="template-card/g)||[]).length,30);
 assert.equal(x.redirects.length,0);
});
test('les pages tarif et accueil ne provoquent pas d’erreur',async()=>{
 for(const [page,logged] of [['premium',true],['home',false]]){
  const x=await simulate(page,logged);
  assert.ok(!x.error.startsWith('Impossible d’ouvrir la page'),page+': '+x.error);
  assert.equal(x.redirects.length,0);
 }
});