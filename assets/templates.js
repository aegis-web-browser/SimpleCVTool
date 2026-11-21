/* Trente compositions : chacune possède sa structure et sa feuille de style. */
'use strict';
(()=>{
 const {esc,rich,safeURL}=SCV;
 const specs=[
 ['Essentiel','Classique','Une colonne, hiérarchie sobre et ligne de séparation.','#283449'],
 ['Obsidienne','Moderne','Identité dans une colonne sombre, parcours à droite.','#253044'],
 ['Rivage','Moderne','Colonne claire à droite et identité pleine largeur.','#245f68'],
 ['Chronologie','Moderne','Parcours vertical jalonné, titres de rubrique décalés.','#5d4ba4'],
 ['Éditorial','Créatif','Grand nom sérif, chapô et composition en colonnes.','#713f52'],
 ['Direction','Cadre','Bandeau d’identité bleu nuit et corps asymétrique.','#203653'],
 ['Académie','Classique','Titre centré, double filet et rubriques en petites capitales.','#423e37'],
 ['Monogramme','Créatif','Initiales encadrées et profil dans une bande latérale.','#7e523f'],
 ['Atelier','Créatif','En-tête décentré, rail graphique et compétences en pied.','#7c493e'],
 ['Grille','Moderne','Modules organisés sur une grille à deux colonnes.','#425890'],
 ['Manifeste','Créatif','Identité XXL et parcours sous un bandeau éditorial.','#252525'],
 ['Précision','Technique','Contacts en rail, rubriques numérotées et monospace.','#315850'],
 ['Signature','Cadre','Nom sérif à droite et colonne de contact à gauche.','#5b4a71'],
 ['Horizon','Moderne','Bandeau supérieur coloré, parcours et panneau de compétences.','#2d6178'],
 ['Diplomate','Classique','Cadre double et séparateurs centrés.','#6f593d'],
 ['Portfolio','Créatif','Portrait dans un bloc d’identité, rubriques en cartes aérées.','#7b415d'],
 ['Boussole','Moderne','Colonne d’identité à droite et grands repères de section.','#306565'],
 ['Focus','Classique','Profil mis en avant et parcours resserré en une colonne.','#38495d'],
 ['Architecte','Technique','Grille de contact technique et rubriques tracées.','#4d5559'],
 ['Gazette','Créatif','Masthead typographique et trois colonnes éditoriales.','#4c493f'],
 ['Épure','Classique','Grandes marges, nom léger et titres en retrait.','#444e60'],
 ['Panorama','Cadre','En-tête scindé, profil pleine largeur et double colonne.','#5b426e'],
 ['Ruban','Moderne','Rubriques sur bandeaux et panneau latéral en retrait.','#355d86'],
 ['Chapitre','Créatif','Grande numérotation et rubriques de type magazine.','#864d45'],
 ['Laboratoire','Technique','Fiche d’identité encadrée et registre à lignes fines.','#3d6150'],
 ['Scène','Créatif','En-tête sombre monumental et filets de couleur vive.','#814473'],
 ['Perspective','Cadre','Profil d’ouverture et colonne droite à bordure forte.','#315271'],
 ['Capsule','Moderne','Identité sur fond doux et rubriques en encadrés arrondis.','#545281'],
 ['Patrimoine','Classique','Typographie sérif, bande latérale étroite et filets doubles.','#655644'],
 ['Trajectoire','Technique','Dates dans une colonne dédiée et compétences en pied.','#285f6c']
 ];
 SCV.premiumTemplateIds=Object.freeze(Array.from({length:27},(_,i)=>i+3));
 SCV.isPremiumTemplate=id=>SCV.premiumTemplateIds.includes(Number(id));
 SCV.templates=specs.map((s,id)=>({id,name:s[0],category:s[1],description:s[2],accent:s[3],premium:SCV.isPremiumTemplate(id)}));
 const item=e=>{const dates=[e.start,e.current?'Aujourd’hui':e.end].filter(Boolean).join(' — '),url=safeURL(e.url);return '<div class="cv-entry"><div class="entry-top"><h3>'+esc(e.title)+'</h3><span class="dates">'+esc(dates)+'</span></div>'+((e.organization||e.location)?'<p class="organization">'+esc([e.organization,e.location].filter(Boolean).join(' · '))+'</p>':'')+rich(e.text)+(url?'<p class="entry-link">'+esc(url)+'</p>':'')+'</div>'};
 const block=(s,i)=>'<section class="cv-section'+(s.breakBefore?' page-break':'')+'" data-section="'+esc(s.id)+'"><h2><span class="section-number">'+String(i+1).padStart(2,'0')+'</span>'+esc(s.title)+'</h2><div class="section-body">'+rich(s.text)+(s.items||[]).filter(e=>[e.title,e.organization,e.text,e.start,e.end,e.url].some(Boolean)).map(item).join('')+'</div></section>';
 function contents(c){return c.sections.filter(s=>s.visible&&(s.text.trim()||s.items.some(e=>[e.title,e.organization,e.text,e.start,e.end,e.url].some(Boolean))))}
 function contact(p){const rows=[p.email,p.phone,p.city,p.address,p.linkedin,p.website,p.github,p.mobility,p.availability,p.extra].filter(Boolean);return rows.length?'<div class="cv-contact">'+rows.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>':''}
 function head(c,withContact=true){const p=c.person;return '<header class="cv-head">'+(p.photo?'<img class="cv-photo '+c.style.photoShape+'" src="'+p.photo+'" alt="Portrait">':'')+'<div class="identity"><h1>'+esc(p.name||'Votre nom')+'</h1>'+(p.role?'<p class="cv-role">'+esc(p.role)+'</p>':'')+(p.tagline?'<p class="tagline">'+esc(p.tagline)+'</p>':'')+'</div>'+(withContact?contact(p):'')+'</header>'}
 const col=(a,b,cl='')=>'<div class="cv-columns '+cl+'"><div class="cv-main">'+a+'</div><aside class="cv-side">'+b+'</aside></div>';
 const layouts=[
 (h,k,a,m,s,p)=>h+a,
 (h,k,a,m,s,p)=>'<div class="identity-columns"><aside class="identity-rail">'+h+s+'</aside><div class="cv-main">'+m+'</div></div>',
 (h,k,a,m,s,p)=>h+col(m,s),
 (h,k,a,m,s,p)=>h+'<div class="timeline">'+a+'</div>',
 (h,k,a,m,s,p)=>h+'<div class="editorial-lead">'+p+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>'<div class="banner">'+h+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>h+'<div class="academic-body">'+a+'</div>',
 (h,k,a,m,s,p,mono)=>'<div class="monohead"><div class="monogram">'+mono+'</div>'+h+'</div>'+col(m,s,'side-first'),
 (h,k,a,m,s,p)=>'<div class="offset-head">'+h+'</div><div class="rail-body">'+m+'</div><div class="bottom-band">'+s+'</div>',
 (h,k,a,m,s,p)=>h+'<div class="module-grid">'+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="manifest-head">'+h+'</div><div class="manifest-body">'+a+'</div>',
 (h,k,a,m,s,p)=>h+'<div class="code-body">'+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="signature-head">'+h+'</div>'+col(m,s,'side-first'),
 (h,k,a,m,s,p)=>'<div class="horizon-head">'+h+'</div>'+col(m,s,'side-first'),
 (h,k,a,m,s,p)=>'<div class="diplomat-frame">'+h+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="portfolio-head">'+h+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>'<div class="compass"><div class="compass-main">'+m+'</div><aside>'+h+s+'</aside></div>',
 (h,k,a,m,s,p)=>h+'<div class="focus-intro">'+p+'</div><div class="focus-body">'+m+s+'</div>',
 (h,k,a,m,s,p)=>'<div class="architect-head">'+h+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>'<div class="masthead">'+h+'</div><div class="gazette">'+a+'</div>',
 (h,k,a,m,s,p)=>h+'<div class="minimal-body">'+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="panorama-head">'+h+'</div><div class="panorama-profile">'+p+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>h+col(m,s,'ribbon-body'),
 (h,k,a,m,s,p)=>'<div class="chapter-head">'+h+'</div><div class="chapters">'+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="lab-card">'+h+'</div><div class="lab-body">'+a+'</div>',
 (h,k,a,m,s,p)=>'<div class="stage-head">'+h+'</div>'+col(m,s,'side-first'),
 (h,k,a,m,s,p)=>h+'<div class="perspective-profile">'+p+'</div>'+col(m,s),
 (h,k,a,m,s,p)=>'<div class="capsule-head">'+h+'</div><div class="capsule-body">'+a+'</div>',
 (h,k,a,m,s,p)=>h+col(m,s,'side-first'),
 (h,k,a,m,s,p)=>h+'<div class="trajectory">'+m+'</div><div class="bottom-band">'+s+'</div>'
 ];
 SCV.render=c=>{const id=c.template,t=SCV.templates[id]||SCV.templates[0],ss=contents(c),promote=[4,17,21,26].includes(t.id),blocks=ss.map((s,i)=>({s,html:block(s,i)}));const all=blocks.map(x=>x.html).join(''),profile=promote?blocks.filter(x=>x.s.type==='profile').map(x=>x.html).join(''):'',main=blocks.filter(x=>x.s.zone!=='side'&&!(promote&&x.s.type==='profile')).map(x=>x.html).join(''),side=blocks.filter(x=>x.s.zone==='side'&&!(promote&&x.s.type==='profile')).map(x=>x.html).join('');const mono=esc(c.person.name.split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('')||'CV'),st=c.style;
 return '<article class="cv t'+t.id+'" style="--accent:'+st.accent+';--text-size:'+st.size+'pt;--leading:'+st.line+';--section-gap:'+st.gap+'px;--padding:'+st.margin+'px;--name-size:'+st.titleSize+'px;--alignment:'+st.align+(st.font?';--body-font:'+st.font:'')+';--body-color:'+ (st.textColor||'#24303a')+';--paper-color:'+(st.paperColor||'#ffffff')+';--photo-size:'+(st.photoSize||92)+'px;--name-weight:'+(st.nameWeight||750)+';--extra-letter-spacing:'+(st.letterSpacing||0)+'px;--heading-case:'+(st.headingStyle||'uppercase')+'">'+layouts[t.id](head(c),contact(c.person),all,main,side,profile,mono)+'</article>'};
})();
