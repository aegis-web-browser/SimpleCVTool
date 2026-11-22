'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'assets/pdf-import.js'),'utf8').replace(/async function library\(\)\{[\s\S]*?\n \}\n function lines\(content\)\{/,'async function library(){return globalThis.TEST_PDFJS;}\n function lines(content){');
function context(scanned=false,noDocumentDestroy=false){
 const pdf={numPages:2,async getPage(n){return {async getTextContent(){return {items:scanned?[]:[{str:'Camille Laurent',hasEOL:true,transform:[1,0,0,1,0,400]},{str:'Master communication - 2021 - Université Lyon 2',transform:[1,0,0,1,0,380]}]}},getViewport(){return {width:650,height:920}},render(){return {promise:Promise.resolve()}}}},async destroy(){this.closed=true}};
 if(noDocumentDestroy)delete pdf.destroy;
 let loadingTaskDestroyed=false;
 const ctx={globalThis:null,Uint8Array,Blob,console,document:{createElement(){return {getContext(){return {}},toDataURL(){return 'data:image/jpeg;base64,AAAA'},width:0,height:0}}}};
 ctx.globalThis=ctx;ctx.TEST_PDFJS={getDocument(){return {promise:Promise.resolve(pdf),async destroy(){loadingTaskDestroyed=true}}}};ctx.wasLoadingTaskDestroyed=()=>loadingTaskDestroyed;vm.runInNewContext(code,ctx,{filename:'pdf-import.js'});
 return ctx.SCVPdf;
}
function file(label='cv.pdf'){const bytes=Buffer.from('%PDF-1.7\nexample');return {name:label,type:'application/pdf',size:bytes.length,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)}}}
test('un PDF externe lisible restitue ses informations sans en inventer',async()=>{
 const r=await context().extract(file());assert.equal(r.pages,2);assert.match(r.text,/Camille Laurent/);assert.match(r.text,/Université Lyon 2/);assert.equal(r.images.length,0)
});
test('un PDF scanné est transmis comme images au moteur de reconnaissance',async()=>{
 const r=await context(true).extract(file());assert.equal(r.scanned,2);assert.equal(r.images.length,2);assert.match(r.images[0],/^data:image\/jpeg;base64,/)
});
test('le CV PDF reste importable si PDF.js ne fournit pas pdf.destroy',async()=>{
 const reader=context(false,true);
 const result=await reader.extract(file());
 assert.equal(result.pages,2);
 assert.match(result.text,/Camille Laurent/);
 assert.equal(reader.wasLoadingTaskDestroyed(),true);
});
test('un fichier sans signature PDF est refusé',async()=>{
 const wrong={name:'cv.pdf',size:12,type:'application/pdf',arrayBuffer:async()=>Buffer.from('ceci nest pas pdf').buffer};
 await assert.rejects(context().extract(wrong),/PDF valide|PDF/);
});
test('l’import PDF Premium est vérifié aussi côté serveur',()=>{
 for(const filename of ['server/index.cjs','supabase/functions/simplecv-api/index.ts']){
  const s=fs.readFileSync(path.join(root,filename),'utf8');assert.match(s,/mode==='pdf_import'/);assert.match(s,/entitlement\(user\.id\)\)\.premium/);assert.match(s,/qwen\/qwen3\.8-27b/);
 }
});
test('le choix de pagination multi-page reste disponible au format A4',()=>{
 const html=fs.readFileSync(path.join(root,'editeur.html'),'utf8'),css=fs.readFileSync(path.join(root,'assets/print-a4.css'),'utf8');
 assert.match(html,/id="printMode"/);assert.match(html,/value="multi"/);assert.match(html,/id="importPDF"/);
 assert.match(css,/#printArea\[data-print-mode="multi"\]/);assert.match(css,/page-break-before:always/);
});
test('le build Cloudflare ne doit jamais publier les fichiers privés',()=>{
 const dist=path.join(root,'dist');for(const secret of ['server','supabase','tests','.env','render.yaml'])assert.ok(!fs.existsSync(path.join(dist,secret)),secret);
});
