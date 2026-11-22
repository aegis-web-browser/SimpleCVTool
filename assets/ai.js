'use strict';
(()=>{
 const allowed=new Set(SCV.kinds.map(kind=>kind[0]));
 const aliases={experiences:'experience',experiences_professionnelles:'experience',professional_experience:'experience',formations:'education',formation:'education',diplomes:'education',competences:'skills',hard_skills:'skills',outils:'tools',logiciels:'tools',software:'tools',langues:'languages',loisirs:'interests',interets:'interests'};
 const typeOf=v=>{const k=String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');return aliases[k]||k};
 const str=v=>typeof v==='string'?v.trim():'';
 function entry(raw={}){return {id:SCV.uid(),title:str(raw.title),organization:str(raw.organization),location:str(raw.location),start:str(raw.start),end:str(raw.end),current:!!raw.current,url:SCV.safeURL(str(raw.url)),text:str(raw.text)}}

 // --- Moteur de composition automatique ---------------------------------
 // L'IA fournit le contenu ; cette couche décide ensuite où chaque bloc doit
 // vivre dans les modèles à colonnes afin d'éviter une colonne saturée et une
 // grande zone vide dans l'autre.
 const TWO_COL=new Set([1,2,4,5,7,12,13,15,16,18,21,22,25,26,28]);
 const PROMOTED_PROFILE=new Set([4,17,21,26]);
 const SIDE_FRIENDLY=new Set(['skills','languages','interests','certifications']);
 const MAIN_LOCKED=new Set(['experience','education','projects','profile']);
 const SIDE_BIAS={skills:0.75,languages:0.25,interests:0.30,certifications:0.45};

 function visualChars(text){
  return str(text).replace(/\*\*|__|\*|•/g,'').length;
 }
 function lineEstimate(text,charsPerLine){
  const raw=str(text);if(!raw)return 0;
  let lines=0;
  for(const ln of raw.split('\n')){
   const c=Math.max(1,visualChars(ln));
   lines+=Math.max(1,Math.ceil(c/charsPerLine));
  }
  return lines;
 }
 function sectionHeight(s,zone='main'){
  // Approximation volontairement simple mais stable : la largeur plus faible
  // du rail latéral crée davantage de retours à la ligne.
  const chars=zone==='side'?29:58;
  let h=34; // titre + espace sous titre
  h+=lineEstimate(s.text,chars)*20;
  for(const e of (s.items||[])){
   if(![e.title,e.organization,e.location,e.start,e.end,e.text,e.url].some(Boolean))continue;
   h+=30;
   h+=lineEstimate([e.title,e.organization,e.location,[e.start,e.end].filter(Boolean).join(' — ')].filter(Boolean).join(' '),chars)*15;
   h+=lineEstimate(e.text,chars)*18;
   if(e.url)h+=17;
   h+=12;
  }
  return h;
 }
 function identityRailHeight(c){
  const p=c.person||{};
  let h=95;
  if(p.photo)h+=112;
  h+=lineEstimate(p.name,20)*38;
  h+=lineEstimate(p.role,24)*24;
  h+=lineEstimate(p.tagline,27)*18;
  const contacts=[p.email,p.phone,p.city,p.address,p.linkedin,p.website,p.github,p.mobility,p.availability,p.extra].filter(Boolean);
  for(const v of contacts)h+=lineEstimate(v,28)*17+4;
  return h;
 }
 function styleForDensity(c,estimatedMax){
  // Ajustements fins seulement : le design reste le même, mais le document
  // respire davantage quand il est court et se compacte proprement si besoin.
  const s=c.style;
  if(estimatedMax>1060){
   s.size=Math.max(9.5,Math.min(+s.size||11,10.25));
   s.line=Math.max(1.2,Math.min(+s.line||1.45,1.30));
   s.gap=Math.max(10,Math.min(+s.gap||18,13));
  }else if(estimatedMax>930){
   s.size=Math.max(10,Math.min(+s.size||11,10.6));
   s.line=Math.max(1.25,Math.min(+s.line||1.45,1.36));
   s.gap=Math.max(12,Math.min(+s.gap||18,15));
  }else if(estimatedMax<620){
   s.gap=Math.max(+s.gap||18,20);
   s.line=Math.max(+s.line||1.45,1.48);
  }
 }
 function autoLayout(c){
  const t=Number(c.template)||0;
  // Toujours remettre les sections lourdes dans le parcours principal.
  for(const s of c.sections){
   if(MAIN_LOCKED.has(s.type))s.zone='main';
  }
  if(!TWO_COL.has(t)){
   styleForDensity(c,c.sections.reduce((n,s)=>n+sectionHeight(s,'main'),0)+180);
   return c;
  }

  const candidates=c.sections.filter(s=>SIDE_FRIENDLY.has(s.type));
  if(!candidates.length)return c;

  // Certains modèles affichent le profil au-dessus des colonnes ; il ne doit
  // pas fausser l'équilibrage entre main et side.
  const promoted=PROMOTED_PROFILE.has(t);
  const fixedMain=c.sections.filter(s=>!SIDE_FRIENDLY.has(s.type)&&!(promoted&&s.type==='profile'));
  let baseMain=fixedMain.reduce((n,s)=>n+sectionHeight(s,'main'),0);
  let baseSide=0;
  // Le modèle 1 met toute l'identité dans le rail gauche, donc on en tient
  // explicitement compte. C'était la cause du gros blanc observé à droite.
  if(t===1)baseSide+=identityRailHeight(c);

  // Brute-force sur les rubriques compactes (au maximum quelques blocs).
  // On cherche la répartition qui minimise le vide entre les deux colonnes,
  // avec une pénalité si un gros bloc est envoyé dans la colonne étroite.
  const n=Math.min(candidates.length,10),limit=1<<n;
  let best=null;
  for(let mask=0;mask<limit;mask++){
   let mh=baseMain,sh=baseSide,penalty=0,sideCount=0;
   for(let i=0;i<n;i++){
    const s=candidates[i],toSide=!!(mask&(1<<i));
    if(toSide){
     const h=sectionHeight(s,'side');sh+=h;sideCount++;
     if(h>430)penalty+=(h-430)*1.8;
     penalty+=(SIDE_BIAS[s.type]??0.5)*-18;
    }else{
     mh+=sectionHeight(s,'main');
     penalty+=(SIDE_BIAS[s.type]??0.5)*12;
    }
   }
   // Éviter un rail complètement vide quand il y a des contenus annexes.
   if(sideCount===0)penalty+=95;
   // Pour les rails d'identité très chargés, ne pas y rajouter trop de texte.
   if(t===1&&sh>1040)penalty+=(sh-1040)*3;
   const max=Math.max(mh,sh),diff=Math.abs(mh-sh);
   const score=max+diff*.72+penalty;
   if(!best||score<best.score)best={score,mask,mh,sh};
  }
  for(let i=0;i<n;i++)candidates[i].zone=(best.mask&(1<<i))?'side':'main';

  // Si la colonne principale reste beaucoup trop vide, déplacer le plus gros
  // bloc annexe vers elle, même si son type est habituellement latéral.
  let mh=baseMain+candidates.filter(s=>s.zone==='main').reduce((n,s)=>n+sectionHeight(s,'main'),0);
  let sh=baseSide+candidates.filter(s=>s.zone==='side').reduce((n,s)=>n+sectionHeight(s,'side'),0);
  if(sh>mh*1.42){
   const movable=candidates.filter(s=>s.zone==='side').sort((a,b)=>sectionHeight(b,'side')-sectionHeight(a,'side'))[0];
   if(movable){movable.zone='main';mh+=sectionHeight(movable,'main');sh-=sectionHeight(movable,'side')}
  }
  styleForDensity(c,Math.max(mh,sh));
  return c;
 }

 function apply(raw,base){
  if(!raw||typeof raw!=='object')throw Error('Réponse IA invalide.');
  const c=SCV.fresh(base?.template??0);if(base){c.template=base.template;c.style=structuredClone(base.style)}
  const p=raw.person&&typeof raw.person==='object'?raw.person:{};for(const k of Object.keys(c.person))if(k!=='photo')c.person[k]=str(p[k])||(base?.person?.[k]&&str(base.person[k]))||'';if(base?.person?.photo)c.person.photo=base.person.photo;
  const sections=[];for(const r of Array.isArray(raw.sections)?raw.sections:[]){if(!r||typeof r!=='object')continue;const kind=typeOf(r.type),type=allowed.has(kind)?kind:'custom';const hasContent=!!str(r.text)||(Array.isArray(r.items)&&r.items.some(e=>e&&[e.title,e.organization,e.text].some(Boolean)));if(!hasContent)continue;const s=SCV.section(type);if(str(r.title))s.title=str(r.title).slice(0,100);s.text=str(r.text).slice(0,16000);s.items=(Array.isArray(r.items)?r.items:[]).slice(0,60).map(entry);if(!s.items.length&&['experience','education','projects','certifications'].includes(s.type))s.items=[];sections.push(s)}
  if(!sections.length)throw Error('L’IA n’a pas trouvé assez d’informations pour construire le CV.');c.sections=sections;c.title=str(raw.title).slice(0,100)||(c.person.role?'CV — '+c.person.role:c.person.name?'CV — '+c.person.name:'CV généré par IA');c.updated=Date.now();return autoLayout(c)
 }
 SCV.aiAutoLayout=autoLayout;
 SCV.aiApply=apply;
})();
