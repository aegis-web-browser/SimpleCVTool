/* Export CV : format A4 sur une page, sans marquage du site. */
'use strict';
globalThis.CVPrint=(()=>{
 let originalTitle=null, bound=false, getName=()=>'', update=()=>{};
 function prepare(name){
  const page=document.getElementById('printArea');
  const cv=page?.querySelector('.cv');
  if(!page||!cv)return {scale:1,ok:false};
  if(originalTitle===null)originalTitle=document.title;
  const safeName=String(name||'Mon CV').replace(/[\r\n\t]/g,' ').trim().slice(0,90)||'Mon CV';
  document.title='CV - '+safeName;
  page.classList.add('print-measuring');
  const style=getComputedStyle(page);
  const horizontal=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
  const vertical=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
  const availableWidth=page.clientWidth-horizontal-4;
  const availableHeight=page.clientHeight-vertical-4;
  const contentWidth=Math.max(1,cv.scrollWidth,cv.getBoundingClientRect().width);
  const contentHeight=Math.max(1,cv.scrollHeight,cv.getBoundingClientRect().height);
  const scale=Math.max(0.05,Math.min(1,availableWidth/contentWidth,availableHeight/contentHeight)*0.98);
  page.style.setProperty('--cv-print-scale',scale.toFixed(5));
  page.classList.remove('print-measuring');
  return {scale,ok:true,contentHeight};
 }
 function reset(){
  if(originalTitle!==null){document.title=originalTitle;originalTitle=null}
 }
 function bind(nameProvider,rerender){
  getName=nameProvider;update=rerender||(()=>{});
  if(bound)return;bound=true;
  window.addEventListener('beforeprint',()=>{update();prepare(getName())});
  window.addEventListener('afterprint',reset);
 }
 async function open(name){
  if(document.fonts?.ready)await document.fonts.ready;
  const imgs=[...document.querySelectorAll('#printArea img')];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
   img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});
  })));
  const result=prepare(name);
  if(!result.ok)throw Error('Aucun CV disponible pour l’impression.');
  window.print();
  return result;
 }
 return {bind,prepare,open,reset};
})();
