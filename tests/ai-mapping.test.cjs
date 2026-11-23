'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'..');
function load(){const ctx=vm.createContext({crypto:crypto.webcrypto,structuredClone,globalThis:null});ctx.globalThis=ctx;for(const f of ['assets/data.js','assets/ai.js'])vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx);return ctx.SCV}
test('ne supprime plus la rubrique outils et conserve les autres rubriques',()=>{
 const SCV=load();const result=SCV.aiApply({person:{name:'Camille'},sections:[{type:'profile',text:'Communication'},{type:'experience',items:[{title:'Chargée communication',organization:'Studio Horizon',start:'2023',end:'2026',text:'- Campagnes'}]},{type:'education',items:[{title:'Master',organization:'Université Lyon 2',start:'2021'}]},{type:'tools',title:'Outils & logiciels',text:'- Canva\n- WordPress'},{type:'languages',title:'Langues',text:'- Anglais C1'}]},SCV.fresh(7));
 assert.equal(result.sections.length,5);
 assert.equal(result.sections.find(s=>s.type==='tools').text,'- Canva\n- WordPress');
 assert.equal(result.sections.find(s=>s.type==='experience').items[0].start,'2023');
 assert.equal(result.sections.find(s=>s.type==='education').items[0].organization,'Université Lyon 2');
});
test('la réécriture conserve les coordonnées qui auraient été omises par le modèle',()=>{
 const SCV=load();const base=SCV.fresh(1);base.person.name='Camille Laurent';base.person.email='camille@example.fr';const result=SCV.aiApply({person:{name:'Camille Laurent'},sections:[{type:'profile',text:'Communication'}]},base);assert.equal(result.person.email,'camille@example.fr');
});
test('types et intitulés équivalents ne suppriment pas les outils et formations',()=>{
 const SCV=load();const x=SCV.aiApply({person:{name:'Camille'},sections:[{type:'formation',text:'Licence communication'},{type:'logiciels',text:'Canva'},{type:'bilan-professionnel',text:'Un élément spécifique fourni'}]},SCV.fresh(0));assert.equal(x.sections.length,3);assert.ok(x.sections.some(s=>s.type==='tools'));assert.ok(x.sections.some(s=>s.type==='custom'));
});

test('une amélioration conserve les expériences et rubriques omises par l’IA',()=>{
 const SCV=load(),base=SCV.fresh(7);
 base.person.name='Camille Laurent';
 const experience=SCV.section('experience');experience.title='Expériences';experience.items=[
  {id:'old1',title:'Chargée de communication',organization:'Studio Horizon',start:'2022',end:'2024',text:'Coordination de campagnes',current:false},
  {id:'old2',title:'Assistante communication',organization:'Agence Nord',start:'2020',end:'2021',text:'Préparation des contenus',current:false}];
 const tools=SCV.section('tools');tools.text='Canva et WordPress';base.sections=[experience,tools];
 const response={title:'CV — communication',person:{name:'Camille Laurent'},sections:[
  {type:'experience',title:'Expériences',items:[{title:'Chargée de communication',organization:'Studio Horizon',start:'2022',end:'2024',text:'Pilotage de campagnes'}]}
 ]};
 const cv=SCV.aiApply(response,base,{preserveExisting:true});
 const exp=cv.sections.find(s=>s.type==='experience');
 assert.equal(exp.items.length,2);assert.equal(exp.items[1].organization,'Agence Nord');
 assert.equal(exp.items[0].id,'old1');
 assert.ok(cv.sections.some(s=>s.type==='tools'&&s.text==='Canva et WordPress'));
 assert.equal(cv.template,7);
});
