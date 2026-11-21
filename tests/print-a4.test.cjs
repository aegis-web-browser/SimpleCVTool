'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(base,'assets/print-a4.css'),'utf8');
const source=fs.readFileSync(path.join(base,'assets/print.js'),'utf8');
const html=fs.readFileSync(path.join(base,'editeur.html'),'utf8');
test('l’éditeur charge le module d’impression A4 et son CSS',()=>{
 assert.match(html,/assets\/print-a4\.css/);
 assert.match(html,/assets\/print\.js/);
 assert.match(html,/assets\/app\.js\?v=/);
});
test('impression A4 sans marge navigateur ni blocage multi-page',()=>{
 assert.match(css,/@page\s*\{[^}]*size:\s*A4 portrait;\s*margin:\s*0;/);
 assert.match(css,/#printArea\s*>\s*\.cv\s*\{/);
 assert.match(css,/transform:\s*scale\(var\(--cv-print-scale/);
 assert.match(css,/page-break-before:\s*auto\s*!important/);
});
test('le titre du PDF ne contient plus le nom du site et retrouve son titre initial',()=>{
 let scale;const classes=new Set();
 const cv={scrollWidth:794,scrollHeight:2450,getBoundingClientRect(){return {width:794,height:2450}}};
 const area={clientWidth:794,clientHeight:1120,querySelector(){return cv},
  classList:{add(s){classes.add(s)},remove(s){classes.delete(s)}},
  style:{setProperty(key,value){if(key==='--cv-print-scale')scale=Number(value)}}};
 const document={title:'Éditeur — SimpleCVTool',getElementById(id){return id==='printArea'?area:null}};
 const ctx={document,window:{addEventListener(){}},getComputedStyle(){return {paddingLeft:'19px',paddingRight:'19px',paddingTop:'19px',paddingBottom:'19px'}},globalThis:null};
 ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx);
 const result=ctx.CVPrint.prepare('Camille Laurent');
 assert.equal(result.ok,true);
 assert.equal(document.title,'CV - Camille Laurent');
 assert.ok(result.scale>0&&result.scale<.5);
 assert.ok(scale>0&&scale<.5);
 assert.equal(classes.size,0);
 ctx.CVPrint.reset();
 assert.equal(document.title,'Éditeur — SimpleCVTool');
});