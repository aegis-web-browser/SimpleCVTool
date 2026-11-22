/* Importation de CV PDF externes. Extraction locale PDF.js ; les images scannées sont soumises à l'IA uniquement sur action de l'utilisateur. */
'use strict';
globalThis.SCVPdf=(()=>{
 const CDN='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/';
 let pending;
 async function library(){
  if(!pending)pending=(async()=>{
   try{const mod=await import('/assets/pdf.min.mjs');mod.GlobalWorkerOptions.workerSrc='/assets/pdf.worker.min.mjs';return mod}
   catch(e){const mod=await import(CDN+'pdf.min.mjs');mod.GlobalWorkerOptions.workerSrc=CDN+'pdf.worker.min.mjs';return mod}
  })();
  return pending;
 }
 function lines(content){
  const out=[];let lastY=null;
  for(const it of content.items||[]){
   if(typeof it.str!=='string')continue;
   const y=Array.isArray(it.transform)?Number(it.transform[5]):null;
   if(lastY!==null&&y!==null&&Math.abs(y-lastY)>4)out.push('\n');
   out.push(it.str+(it.hasEOL?'\n':' '));
   if(y!==null)lastY=y;
  }
  return out.join('').replace(/[ \t]{2,}/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 async function scan(page){
  const original=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:Math.min(2,Math.max(.7,1000/original.width))});
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(viewport.width));canvas.height=Math.max(1,Math.round(viewport.height));
  const ctx=canvas.getContext('2d',{alpha:false});
  await page.render({canvasContext:ctx,canvas,viewport}).promise;
  const image=canvas.toDataURL('image/jpeg',.65);
  canvas.width=0;canvas.height=0;
  return image;
 }
 async function extract(file,onProgress=()=>{}){
  if(!file||!(/\.pdf$/i.test(file.name)||file.type==='application/pdf'))throw Error('Sélectionnez un CV au format PDF.');
  if(file.size>10*1024*1024)throw Error('Ce PDF dépasse 10 Mo. Réduisez sa taille avant importation.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw Error('Ce fichier ne semble pas être un PDF valide.');
  const pdfjs=await library();
  let pdf;
  try{pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true}).promise}
  catch(e){if(/password|encrypted/i.test(String(e?.name)+' '+String(e?.message)))throw Error('Le PDF est protégé par un mot de passe. Déverrouillez-le avant importation.');throw Error('Impossible de lire ce PDF. Vérifiez qu’il n’est pas endommagé.');}
  try{
   if(pdf.numPages>12)throw Error('Le PDF dépasse 12 pages. Importez une version plus courte pour éviter toute perte de contenu.');
   const textPages=[],scans=[];
   for(let n=1;n<=pdf.numPages;n++){
    onProgress('Lecture du PDF : page '+n+'/'+pdf.numPages+'…');
    const page=await pdf.getPage(n),txt=lines(await page.getTextContent());
    if(txt.length>=25)textPages.push('PAGE '+n+'\n'+txt);
    else scans.push(page);
   }
   if(scans.length>3)throw Error('Ce PDF contient plus de 3 pages scannées. Une version avec texte sélectionnable est nécessaire pour éviter d’en perdre.');
   const images=[];
   for(let i=0;i<scans.length;i++){
    onProgress('Reconnaissance prévue pour la page scannée '+(i+1)+'/'+scans.length+'…');
    images.push(await scan(scans[i]));
   }
   const text=textPages.join('\n\n').slice(0,15000);
   if(!text&&images.length===0)throw Error('Aucun contenu exploitable trouvé dans le PDF.');
   return {text,images,pages:pdf.numPages,scanned:images.length,wasTruncated:textPages.join('\n\n').length>15000};
  }finally{await pdf.destroy()}
 }
 return {extract};
})();
