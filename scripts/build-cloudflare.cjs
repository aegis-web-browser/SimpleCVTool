'use strict';
// Cloudflare Pages : ne publier que les ressources destinées au navigateur.
// Ne JAMAIS copier server/, tests/, docs/, supabase/, fichiers .env, clés API.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'dist');
const html=['index.html','inscription.html','connexion.html','dashboard.html','editeur.html','modeles.html','premium.html','compte.html','mentions.html','conditions.html'];
const safeAsset=/^[a-zA-Z0-9_-]+\.(?:css|js|png|svg|jpe?g|webp|ico)$/;
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
for(const file of html){
 const source=path.join(root,file);
 if(!fs.statSync(source).isFile())throw Error('Page manquante : '+file);
 fs.copyFileSync(source,path.join(out,file));
}
for(const file of fs.readdirSync(path.join(root,'assets'))){
 if(!safeAsset.test(file))continue;
 const source=path.join(root,'assets',file);
 if(fs.statSync(source).isFile())fs.copyFileSync(source,path.join(out,'assets',file));
}
// Inclure le moteur PDF.js dans les ressources publiques du navigateur.
const pdfLib=path.join(root,'node_modules','pdfjs-dist','build');
for (const file of ['pdf.min.mjs','pdf.worker.min.mjs']) {
 const src=path.join(pdfLib,file);
 if (!fs.existsSync(src)) {
  console.warn('PDF.js non installé pour ce build local : import possible avec repli CDN.');
  continue;
 }
 fs.copyFileSync(src,path.join(out,'assets',file));
}
fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2)+'\n');
fs.writeFileSync(path.join(out,'_headers'),[
'/*','  X-Content-Type-Options: nosniff','  X-Frame-Options: DENY',
'  Referrer-Policy: strict-origin-when-cross-origin','  Permissions-Policy: camera=(), microphone=(), geolocation=()',
'','/assets/*','  Cache-Control: public, max-age=3600',
'','/*.html','  Cache-Control: no-store',
].join('\n')+'\n');
console.log('Cloudflare Pages : '+html.length+' pages, '+fs.readdirSync(path.join(out,'assets')).length+' fichiers publics. Répertoire dist/.');
