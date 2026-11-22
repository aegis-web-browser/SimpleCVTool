// SimpleCVTool Cloudflare + Supabase Edge Functions (Deno Web Runtime).
// Secret keys remain in Supabase Edge Function Secrets, never in GitHub or Cloudflare static assets.
// verify_jwt is OFF at the Edge gateway to accept public CAPTCHA and Stripe webhooks.
// Every protected route explicitly verifies the Supabase access token on /auth/v1/user.
const env = (name) => Deno.env.get(name) || '';
const SB=env('SUPABASE_URL').replace(/\/$/,'');
const ANON=env('SUPABASE_ANON_KEY');
const SERVICE=env('SUPABASE_SERVICE_ROLE_KEY');
const GROQ=env('GROQ_API_KEY');
const MODEL=env('GROQ_MODEL')||'openai/gpt-oss-20b';
const STRIPE=env('STRIPE_SECRET_KEY');
const SITE=(env('PUBLIC_SITE_URL')||'https://simplecvtool.pages.dev').replace(/\/$/,'');
const PRO_PRICE=env('STRIPE_PRICE_ID_PRO')||'price_1UeH7zBJwgITD16gZ4QyQkgf';
const PASS_PRICE=env('STRIPE_PRICE_ID_PASS')||'price_1UeH81BJwgITD16ge3ovQev2';
const bad=(status,message)=>Object.assign(new Error(message),{status});
const encoder=new TextEncoder();
const sleep=(n)=>new Promise(r=>setTimeout(r,n));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const plain=(data,status=200,contentType='text/plain; charset=utf-8')=>new Response(data,{status,headers:{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function jsonBody(req,max=102400){const raw=await req.text();if(raw.length>max)throw bad(413,'Texte trop volumineux.');try{return JSON.parse(raw)}catch{throw bad(400,'JSON invalide.')}}
async function remote(url,opts={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000);
 try{
  const response=await fetch(url,{...opts,signal:controller.signal});
  const text=await response.text();let value;
  try{value=JSON.parse(text)}catch{value={message:text.slice(0,500)}}
  if(!response.ok)throw bad(response.status,value.error?.message||value.error_description||value.message||`Erreur du fournisseur (${response.status}).`);
  return value;
 }finally{clearTimeout(timer)}
}
function sbHeaders(key=SERVICE){const h={apikey:key,'content-type':'application/json'};if(!key.startsWith('sb_secret_')&&!key.startsWith('sb_publishable_'))h.Authorization='Bearer '+key;return h}
async function admin(table,opts={}){
 if(!SB||!SERVICE)throw bad(503,'Supabase n’est pas configuré sur le serveur.');
 return remote(`${SB}/rest/v1/${table}`,{...opts,headers:{...sbHeaders(),...(opts.headers||{})}});
}
async function verifyUser(req){
 if(!SB||!ANON)throw bad(503,'Supabase Auth n’est pas configuré.');
 const token=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw bad(401,'Connectez-vous pour continuer.');
 const user=await remote(`${SB}/auth/v1/user`,{headers:{apikey:ANON,Authorization:'Bearer '+token}}).catch(()=>{throw bad(401,'Votre session a expiré. Reconnectez-vous.')});
 if(!user?.id)throw bad(401,'Session invalide.');return user;
}
async function entitlement(id){
 const rows=await admin(`entitlements?user_id=eq.${encodeURIComponent(id)}&select=*`);
 const e=rows?.[0]||{};
 const active=e.plan==='promo'||((e.plan==='pro'||e.plan==='pass')&&e.access_until&&Date.parse(e.access_until)>Date.now());
 return {plan:active?e.plan:'free',premium:!!active,expiresAt:active?e.access_until:null,freeAIUsed:e.free_ai_used||0,customerId:e.stripe_customer_id||null,subscriptionId:e.stripe_subscription_id||null};
}
async function saveEntitlement(id,update){
 return admin('entitlements?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{user_id:id,...update}])});
}
async function stripeRequest(endpoint,params,method='POST'){
 if(!STRIPE)throw bad(503,'Stripe doit être configuré dans les secrets Supabase.');
 return remote(`https://api.stripe.com/v1/${endpoint}`,{method,headers:{Authorization:'Bearer '+STRIPE,'content-type':'application/x-www-form-urlencoded'},...(params?{body:new URLSearchParams(params).toString()}:{})});
}
async function paidCheckout(s,id){
 if(s.client_reference_id!==id||s.status!=='complete'||!['paid','no_payment_required'].includes(s.payment_status))throw bad(409,'Paiement non confirmé ou ne correspondant pas à ce compte.');
 const customer=typeof s.customer==='string'?s.customer:s.customer?.id;
 const opts={stripe_customer_id:customer||null};
 if(s.mode==='payment'&&s.metadata?.plan==='pass'){
  const until=new Date((Number(s.created)||0)*1000+3*86400000).toISOString();
  const previous=await entitlement(id);
  if(previous.plan!=='pro'&&previous.plan!=='promo'&&Date.parse(until)>Date.now())await saveEntitlement(id,{...opts,plan:'pass',access_until:until});
 }else if(s.mode==='subscription'&&s.subscription){
  const sid=typeof s.subscription==='string'?s.subscription:s.subscription.id;
  const sub=await stripeRequest(`subscriptions/${encodeURIComponent(sid)}`,null,'GET');
  await updateSubscription(sub,id);
 }
}
async function updateSubscription(s,explicitId){
 const sid=s.id;let uid=explicitId||s.metadata?.user_id;
 if(!uid){const rows=await admin(`entitlements?stripe_subscription_id=eq.${encodeURIComponent(sid)}&select=user_id`);uid=rows[0]?.user_id}
 if(!uid)return;
 if((await entitlement(uid)).plan==='promo')return;
 const active=['active','trialing'].includes(s.status);
 const seconds=Number(s.items?.data?.[0]?.current_period_end||s.current_period_end||0);
 const until=seconds?new Date(seconds*1000).toISOString():null;
 if(active&&until&&Date.parse(until)>Date.now())await saveEntitlement(uid,{plan:'pro',access_until:until,stripe_subscription_id:sid,stripe_customer_id:typeof s.customer==='string'?s.customer:s.customer?.id});
 else await saveEntitlement(uid,{plan:'free',access_until:null,stripe_subscription_id:sid,stripe_customer_id:typeof s.customer==='string'?s.customer:s.customer?.id});
}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256(data){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(data))))}
function equalConstantTime(a,b){const x=String(a),y=String(b);if(x.length!==y.length)return false;let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0}
async function signatureDigest(secret,raw){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(raw))));
}
async function checkStripeSignature(raw,sig){
 const secret=env('STRIPE_WEBHOOK_SECRET');if(!secret)throw bad(503,'Webhook Stripe non configuré.');
 const parts=String(sig||'').split(',').map(x=>x.split('='));
 const ts=Number(parts.find(x=>x[0]==='t')?.[1]||0);
 if(!ts||Math.abs(Date.now()/1000-ts)>300)throw bad(400,'Horodatage Stripe invalide.');
 const computed=await signatureDigest(secret,`${ts}.${raw}`);
 if(!parts.filter(x=>x[0]==='v1').some(x=>/^[0-9a-f]{64}$/.test(x[1]||'')&&equalConstantTime(x[1],computed)))throw bad(400,'Signature Stripe invalide.');
}
async function handleWebhook(req){
 const raw=await req.text();if(raw.length>1500000)throw bad(413,'Événement Stripe trop volumineux.');
 await checkStripeSignature(raw,req.headers.get('stripe-signature'));
 const event=JSON.parse(raw);
 const seen=await admin(`stripe_events?id=eq.${encodeURIComponent(event.id)}&select=id`);
 if(seen.length)return json({received:true});
 const s=event.data?.object||{};
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&s.client_reference_id&&s.payment_status==='paid')await paidCheckout(s,s.client_reference_id);
 if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))await updateSubscription(s);
 await admin('stripe_events',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify([{id:event.id}])});
 return json({received:true});
}
const instruction=`Tu es une rédactrice experte de CV en français. Ta priorité absolue est de TRANSFORMER TOUTES les informations du candidat en un CV complet, non de résumer le candidat à son profil.
FORMAT OBLIGATOIRE : retourne exclusivement un objet JSON avec {"title":"CV — métier","person":{"name":"","role":"","tagline":"","email":"","phone":"","city":"","address":"","linkedin":"","website":"","github":""},"sections":[{"type":"profile|experience|education|skills|languages|tools|interests|projects|certifications|training|softskills|volunteer|achievements|awards|publications|conferences|availability|memberships|references|teaching|research|custom","title":"","text":"","items":[{"title":"","organization":"","location":"","start":"","end":"","current":false,"text":"","url":""}]}]}.
RUBRIQUES FACULTATIVES : exploite les informations effectivement données, sans exiger toutes les catégories. Un CV avec un profil, des compétences ou une seule expérience est valide. N'ajoute pas de rubriques sans éléments vérifiables. Si un poste ou diplôme est indiqué, place-le dans sa rubrique ; sinon, ne crée pas cette rubrique. Ne refuse jamais un CV pour manque de détails.
QUALITÉ DE RÉDACTION : un profil de deux à trois phrases maximum, sans répéter mot pour mot les expériences. Les descriptions de postes vont dans experience.items[].text, sous forme de 2 à 4 puces concrètes \"- Mission\" séparées par \\n lorsque les notes sont assez riches ; réorganise et reformule avec un vocabulaire professionnel et des verbes précis. Évite les redites, le remplissage, les phrases inachevées, les typos et les répétitions accidentelles (par exemple \"CDI CDI\"). Liste les compétences, outils et langues un par ligne (\"- élément\"), pas une longue phrase avec virgules. Conserve les performances et chiffres seulement quand fournis.
FIABILITÉ : ne jamais inventer : n'invente JAMAIS de poste, organisation, période, diplôme, université, langue, niveau, logiciel, résultat quantifié ni compétence. Ne convertis pas une ambition ou un poste recherché en expérience passée. N'attribue pas des réalisations à une entreprise sans preuve dans les notes. S'il manque une donnée, laisse son champ vide plutôt que de l'inventer. Réécris fidèlement, sans en déduire de faits nouveaux.
ORDRE DES RUBRIQUES PRÉSENTES : profile, experience, education, skills, tools, languages, interests, puis les rubriques secondaires effectivement documentées. Adapte la longueur aux notes pour garder un CV lisible en A4.`;
const sectionAliases={experiences:'experience',jobs:'experience',employment:'experience',professional_experience:'experience',work_experience:'experience',experiences_professionnelles:'experience',formations:'education',formation:'education',studies:'education',diplomas:'education',diplomes:'education',competences:'skills',hard_skills:'skills',technical_skills:'skills',outils:'tools',logiciels:'tools',software:'tools',langues:'languages',loisirs:'interests',centres_d_interet:'interests',centres_interet:'interests',interets:'interests'};
function canonicalType(v){const key=String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');return sectionAliases[key]||key}
function normalizeAISections(cv){
 if(!Array.isArray(cv?.sections))return cv;
 cv.sections=cv.sections.filter(s=>s&&typeof s==='object');
 for(const s of cv.sections){s.type=canonicalType(s.type);if(!Array.isArray(s.items))s.items=[]}
 const priority=['profile','experience','education','skills','tools','languages','interests'];
 cv.sections.sort((a,b)=>{
  const ia=priority.indexOf(a.type),ib=priority.indexOf(b.type);
  return (ia<0?priority.length:ia)-(ib<0?priority.length:ib);
 });
 return cv;
}
// JSON Schema strict : compatible avec Groq GPT-OSS 20B (sortie contrainte).
// Toutes les rubriques sont facultatives : seules les propriétés des objets sont obligatoires,
// mais leurs valeurs peuvent être vides et sections peut être un tableau vide.
const CV_PERSON_FIELDS=['name','role','tagline','email','phone','city','address','linkedin','website','github','mobility','availability','extra'];
const CV_ENTRY_FIELDS=['title','organization','location','start','end','current','text','url'];
const CV_TYPES=['profile','experience','education','skills','languages','projects','certifications','tools','softskills','volunteer','awards','publications','conferences','training','interests','achievements','availability','memberships','references','teaching','research','custom'];
const cvStringFields=names=>Object.fromEntries(names.map(k=>[k,{type:'string'}]));
const CV_SCHEMA={
 type:'object',additionalProperties:false,
 properties:{
  title:{type:'string'},
  person:{type:'object',additionalProperties:false,properties:cvStringFields(CV_PERSON_FIELDS),required:CV_PERSON_FIELDS},
  sections:{type:'array',items:{type:'object',additionalProperties:false,properties:{
   type:{type:'string',enum:CV_TYPES},title:{type:'string'},text:{type:'string'},
   items:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    ...cvStringFields(CV_ENTRY_FIELDS.filter(k=>k!=='current')),current:{type:'boolean'}
   },required:CV_ENTRY_FIELDS}}
  },required:['type','title','text','items']}}
 },required:['title','person','sections']
};
function parseGroqCV(output){
 if(typeof output!=='string'||!output.trim())throw bad(502,'Groq n’a pas fourni de réponse exploitable.');
 let raw=output.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
 let value;
 try{value=JSON.parse(raw)}catch{
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw bad(502,'La réponse IA n’est pas un document valide.');
  try{value=JSON.parse(raw.slice(first,last+1))}catch{throw bad(502,'La réponse IA n’est pas un document valide.')}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw bad(502,'La réponse IA n’est pas un CV valide.');
 if(value.cv&&typeof value.cv==='object'&&!value.sections)value=value.cv;
 if(!Array.isArray(value.sections))value.sections=[];
 return normalizeAISections(value);
}
function retryableGroqError(err){
 if(err.status===502)return true;
 return [400,422].includes(err.status)&&/json|schema|format|failed_generation|validation|generated/i.test(String(err.message||''));
}

async function ai(user,body){
 if(!GROQ)throw bad(503,'L’assistant IA doit être configuré dans les secrets Supabase.');
 const mode=body.mode==='pdf_import'?'pdf_import':body.mode==='improve'?'improve':'generate',prompt=typeof body.prompt==='string'?body.prompt.trim():'';
 const images=mode==='pdf_import'?(Array.isArray(body.images)?body.images:[]):[];
 if(mode==='pdf_import' && !(await entitlement(user.id)).premium)throw bad(403,'L’import de CV PDF est réservé à Premium.');
 if(images.length>3||images.some(x=>typeof x!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x)||x.length>1100000)||images.join('').length>3000000)throw bad(413,'Images PDF trop volumineuses. Réduisez le document.');
 const detail=['concise','balanced','detailed'].includes(body.detail)?body.detail:'balanced';
 const source=body.cv&&typeof body.cv==='object'?body.cv:{};
 const cvFacts={title:source.title||'',person:{...source.person,photo:undefined},sections:Array.isArray(source.sections)?source.sections.map(s=>({type:s.type,title:s.title,mode:s.mode,text:s.text,items:s.items,visible:s.visible})):[]};
 const facts=body.facts&&typeof body.facts==='object'&&!Array.isArray(body.facts)?body.facts:{};
 const factFields=['experience','education','tools','skills','languages','interests'];
 const extra=mode==='generate'?factFields.filter(k=>typeof facts[k]==='string'&&facts[k].trim()).map(k=>k.toUpperCase()+':\n'+facts[k].trim().slice(0,3000)).join('\n\n'):'';
 const context=mode==='improve'?JSON.stringify(cvFacts):prompt+(extra?'\n\nINFORMATIONS STRUCTURÉES :\n'+extra:'');
 if((context.trim().length<5 && !(mode==='pdf_import' && images.length))||context.length>16000)throw bad(400,'Fournissez quelques informations sur votre parcours (5 à 16 000 caractères).');
 const reserved=await admin('rpc/reserve_ai_use',{method:'POST',body:JSON.stringify({p_user_id:user.id})});
 if(!reserved?.allowed)throw bad(429,reserved?.message||'Votre quota IA est atteint.');
 try{
  let workingContext=context;
  if(mode==='pdf_import'&&images.length){
   const visionBody={model:'qwen/qwen3.8-27b',max_completion_tokens:4500,temperature:0,
    messages:[{role:'user',content:[{type:'text',text:'OCR de CV : retranscris fidèlement et intégralement tout le texte visible sur ces pages de curriculum vitae, en respectant les noms, les dates, les entreprises, les diplômes et les listes. N’invente aucune information. Retourne uniquement le texte brut, sans introduction.'},...images.map(url=>({type:'image_url',image_url:{url}}))]}]};
   const extracted=await remote('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},body:JSON.stringify(visionBody)});
   const recognized=extracted?.choices?.[0]?.message?.content;
   if(typeof recognized!=='string'||recognized.trim().length<10)throw bad(502,'Le PDF scanné n’a pas pu être reconnu. Utilisez une version avec texte sélectionnable.');
   workingContext=(context+'\n\nTEXTE RECONNU SUR LES PAGES SCANNÉES :\n'+recognized.trim()).slice(0,16000);
  }
  const advice={concise:'Style synthétique : profil maximum 2 phrases. N’invente aucune expérience.',balanced:'Style équilibré : profil 3 phrases maximum, 2 à 4 puces par poste lorsque les faits le justifient.',detailed:'Style détaillé : 3 à 5 puces par poste décrit, sans invention.'};
  const messages=[{role:'system',content:instruction+'\nRéponds par un seul objet JSON. Les rubriques sans information sont facultatives.'},{role:'user',content:advice[detail]+'\n'+(mode==='improve'?'Améliore ce CV sans changer les faits : ':mode==='pdf_import'?'Convertis intégralement le CV PDF externe en rubriques structurées (sans reprendre sa mise en page). Conserve les noms, dates, études, compétences et expériences visibles, sans inventer : ':'Rédige un CV à partir des notes : ')+workingContext}];
  const request={model:MODEL,temperature:0.22,max_completion_tokens:6500,reasoning_effort:'low',reasoning_format:'hidden',messages};
  if(['openai/gpt-oss-20b','openai/gpt-oss-120b'].includes(MODEL))request.response_format={type:'json_schema',json_schema:{name:'simplecvtool_cv',strict:true,schema:CV_SCHEMA}};
  else request.response_format={type:'json_object'};
  const groqOpts=x=>({method:'POST',headers:{Authorization:'Bearer '+GROQ,'content-type':'application/json'},body:JSON.stringify(x)});
  let out,cv;
  try{
   out=await remote('https://api.groq.com/openai/v1/chat/completions',groqOpts(request));
   if(out?.choices?.[0]?.finish_reason==='length')throw bad(502,'Réponse IA tronquée.');
   cv=parseGroqCV(out?.choices?.[0]?.message?.content);
  }catch(err){
   if(!retryableGroqError(err))throw err;
   const fallback={...request,temperature:0.1,max_completion_tokens:7500,messages:[...messages,{role:'user',content:'Réponds uniquement par un document JSON valide, sans Markdown. Une rubrique absente des notes est facultative.'}]};
   delete fallback.response_format;
   out=await remote('https://api.groq.com/openai/v1/chat/completions',groqOpts(fallback));
   cv=parseGroqCV(out?.choices?.[0]?.message?.content);
  }
  if(!cv.sections.length){const text=mode!=='improve'?workingContext:String(source?.person?.tagline||source?.person?.role||'').trim();cv.sections=[{type:'profile',title:'Profil professionnel',text:text.slice(0,1200),items:[]}]}
  return {cv,model:MODEL,usage:out.usage||{},remaining:reserved.remaining};
 }catch(err){
  try{await admin('rpc/refund_ai_use',{method:'POST',body:JSON.stringify({p_user_id:user.id,p_plan:reserved.plan})})}catch(e){console.error('Remboursement quota impossible',e.message)}
  if(err.status===429)throw bad(429,'Le service IA est temporairement saturé. Votre utilisation n’a pas été conservée.');
  if(err.status===401||err.status===403)throw bad(503,'L’assistant IA est indisponible, contactez le support.');
  if([400,422,502].includes(err.status)||err.name==='AbortError')throw bad(502,'La génération IA a rencontré un problème. Réessayez : aucune utilisation n’a été conservée.');
  throw err;
 }
}

// CAPTCHA visuel: caractères dessines en vecteurs, non exposes en clair dans le SVG.
const captchaAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function rnd(max){const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0]%max}
const captchaGlyphs={
 A:'01110:10001:10001:11111:10001:10001:10001',
 B:'11110:10001:10001:11110:10001:10001:11110',
 C:'01111:10000:10000:10000:10000:10000:01111',
 D:'11110:10001:10001:10001:10001:10001:11110',
 E:'11111:10000:10000:11110:10000:10000:11111',
 F:'11111:10000:10000:11110:10000:10000:10000',
 G:'01111:10000:10000:10111:10001:10001:01111',
 H:'10001:10001:10001:11111:10001:10001:10001',
 J:'00111:00010:00010:00010:10010:10010:01100',
 K:'10001:10010:10100:11000:10100:10010:10001',
 L:'10000:10000:10000:10000:10000:10000:11111',
 M:'10001:11011:10101:10101:10001:10001:10001',
 N:'10001:11001:10101:10011:10001:10001:10001',
 P:'11110:10001:10001:11110:10000:10000:10000',
 Q:'01110:10001:10001:10001:10101:10010:01101',
 R:'11110:10001:10001:11110:10100:10010:10001',
 S:'01111:10000:10000:01110:00001:00001:11110',
 T:'11111:00100:00100:00100:00100:00100:00100',
 U:'10001:10001:10001:10001:10001:10001:01110',
 V:'10001:10001:10001:10001:10001:01010:00100',
 W:'10001:10001:10001:10101:10101:10101:01010',
 X:'10001:10001:01010:00100:01010:10001:10001',
 Y:'10001:10001:01010:00100:00100:00100:00100',
 Z:'11111:00001:00010:00100:01000:10000:11111',
 2:'11110:00001:00001:01110:10000:10000:11111',
 3:'11110:00001:00001:01110:00001:00001:11110',
 4:'10010:10010:10010:11111:00010:00010:00010',
 5:'11111:10000:10000:11110:00001:00001:11110',
 6:'01111:10000:10000:11110:10001:10001:01110',
 7:'11111:00001:00010:00100:01000:01000:01000',
 8:'01110:10001:10001:01110:10001:10001:01110',
 9:'01110:10001:10001:01111:00001:00001:11110'
};
function captchaSvg(code){
 const rand=(max)=>rnd(max);
 const lines=Array.from({length:17},()=>`<line x1="${rand(240)}" y1="${rand(90)}" x2="${rand(240)}" y2="${rand(90)}" stroke="#adc9d7" stroke-width="${1+rand(2)}" opacity=".48" />`).join('');
 const letters=[...code].map((letter,i)=>{
  const x=18+i*43+rand(7),y=16+rand(12),rotation=rand(19)-9;
  let path='';const rows=captchaGlyphs[letter].split(':');
  for(let j=0;j<rows.length;j++)for(let k=0;k<5;k++)if(rows[j][k]==='1')path+=`M${k*5} ${j*5}h4v4h-4z`;
  return `<g transform="translate(${x} ${y}) rotate(${rotation} 13 18)" fill="${i%2?'#164b78':'#162e52'}"><path d="${path}" /></g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90" viewBox="0 0 240 90"><rect width="240" height="90" rx="12" fill="#eaf5fc"/><path d="M0 70 Q 120 13 240 65" stroke="#c3d8e7" stroke-width="10" fill="none" opacity=".45"/>${lines}${letters}</svg>`;
}


function ip(req){return String(req.headers.get('x-client-ip')||'unknown').slice(0,128)}
async function rateTable(table,filter,limit,message){
 const rows=await admin(`${table}?${filter}&select=id&limit=${limit+1}`);
 if(rows.length>=limit)throw bad(429,message);
}
async function makeCaptcha(req){
 const client=await sha256(ip(req));
 const cutoff=new Date(Date.now()-60000).toISOString();
 await rateTable('simplecv_captcha',`ip_hash=eq.${client}&created_at=gte.${encodeURIComponent(cutoff)}`,24,'Trop de codes demandés, réessayez dans une minute.');
 const id=crypto.randomUUID();
 const code=Array.from({length:5},()=>captchaAlphabet[rnd(captchaAlphabet.length)]).join('');
 const hash=await sha256(code);
 await admin('simplecv_captcha',{method:'POST',body:JSON.stringify([{id,answer_hash:hash,ip_hash:client,expires_at:new Date(Date.now()+300000).toISOString()}])});
 return json({captchaId:id,image:'data:image/svg+xml;base64,'+btoa(captchaSvg(code)),expiresInSeconds:300});
}
async function checkCaptcha(req,body){
 const id=String(body.captchaId||'');
 const answer=String(body.captchaAnswer||'').trim().toUpperCase();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[A-Z2-9]{5}$/.test(answer))throw bad(400,'CAPTCHA incorrect ou expiré. Actualisez le code.');
 // DELETE RETURNING est atomique : le même CAPTCHA ne peut être accepté deux fois.
 const rows=await admin(`simplecv_captcha?id=eq.${encodeURIComponent(id)}&select=*`,{method:'DELETE',headers:{Prefer:'return=representation'}});
 const row=rows[0];
 if(!row||Date.parse(row.expires_at)<Date.now()||row.ip_hash!==(await sha256(ip(req)))||!equalConstantTime(row.answer_hash,await sha256(answer))){
  throw bad(400,'CAPTCHA incorrect ou expiré. Actualisez le code et réessayez.');
 }
}
async function immediateRegistration(req){
 if(!SB||!ANON||!SERVICE)throw bad(503,'Inscription temporairement indisponible.');
 const origin=req.headers.get('origin');
 if(origin&&origin!==SITE&&!/^https:\/\/[a-z0-9-]+\.simplecvtool\.pages\.dev$/.test(origin))throw bad(403,'Origine non autorisée.');
 const b=await jsonBody(req,4096);
 if(typeof b.website==='string'&&b.website.trim())throw bad(400,'Formulaire invalide.');
 await checkCaptcha(req,b);
 const ipHash=await sha256(ip(req));
 const cutoff=new Date(Date.now()-3600000).toISOString();
 await rateTable('simplecv_signup_attempt',`ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(cutoff)}`,5,'Trop de créations de comptes. Réessayez plus tard.');
 await admin('simplecv_signup_attempt',{method:'POST',body:JSON.stringify([{ip_hash:ipHash}])});
 const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
 const password=typeof b.password==='string'?b.password:'';
 if(email.length>180||!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email))throw bad(400,'Adresse e-mail incorrecte.');
 if(password.length<12||password.length>200)throw bad(400,'Le mot de passe doit contenir entre 12 et 200 caractères.');
 try{
  await remote(`${SB}/auth/v1/admin/users`,{method:'POST',headers:sbHeaders(),body:JSON.stringify({email,password,email_confirm:true})});
 }catch(e){
  if([422,409].includes(e.status))throw bad(409,'Cette adresse e-mail ne peut pas être utilisée. Essayez de vous connecter.');
  console.error('Erreur création compte:',e.status||500);throw bad(503,'Inscription momentanément indisponible.');
 }
 const session=await remote(`${SB}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({email,password})});
 if(!session?.access_token||!session?.user?.id)throw bad(502,'Compte créé. Essayez de vous connecter.');
 return json(session,201);
}
async function redeemPremium(user,req){
 const cutoff=new Date(Date.now()-900000).toISOString();
 await rateTable('simplecv_promo_attempt',`user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(cutoff)}`,5,'Trop de tentatives. Réessayez dans 15 minutes.');
 await admin('simplecv_promo_attempt',{method:'POST',body:JSON.stringify([{user_id:user.id}])});
 const b=await jsonBody(req,600);
 const code=String(b.code||'').trim(),secret=env('OWNER_PREMIUM_CODE');
 if(!secret||code.length<4||code.length>100||!equalConstantTime(await sha256(code),await sha256(secret)))throw bad(400,'Code incorrect ou indisponible.');
 if((await entitlement(user.id)).plan==='promo')return json({ok:true,premium:true,plan:'promo'});
 await saveEntitlement(user.id,{plan:'promo',access_until:null,promo_redeemed_at:new Date().toISOString()});
 return json({ok:true,premium:true,plan:'promo'});
}
function siteOrigin(req){
 // Ne jamais construire des URL Stripe à partir d'un en-tête arbitraire.
 const claimed=req.headers.get('x-request-site')||req.headers.get('origin')||'';
 if(claimed===SITE)return SITE;
 if(/^https:\/\/[a-z0-9-]+\.simplecvtool\.pages\.dev$/.test(claimed))return claimed;
 return SITE;
}
async function route(req){
 const original=new URL(req.url);
 const needle='/api/';const p=original.pathname;
 const index=p.indexOf(needle);if(index<0)throw bad(404,'Route introuvable.');
 const route=p.slice(index);
 if(route==='/api/health')return json({ok:true,supabaseConfigured:!!(SB&&ANON&&SERVICE),groqConfigured:!!GROQ,stripeConfigured:!!STRIPE});
 if(route==='/api/public-config.js')return plain(`window.SIMPLECV_PUBLIC=${JSON.stringify({url:SB,anonKey:ANON})};`,200,'text/javascript; charset=utf-8');
 if(route==='/api/auth/captcha'&&req.method==='GET')return makeCaptcha(req);
 if(route==='/api/auth/register'&&req.method==='POST')return immediateRegistration(req);
 if(route==='/api/stripe/webhook'&&req.method==='POST')return handleWebhook(req);
 const user=await verifyUser(req);
 if(route==='/api/premium/redeem'&&req.method==='POST')return redeemPremium(user,req);
 if(route==='/api/account'&&req.method==='GET'){
  const e=await entitlement(user.id);let remainingAI=Math.max(0,3-e.freeAIUsed);
  if(e.premium){const day=new Date().toISOString().slice(0,10);const rows=await admin(`ai_daily_usage?user_id=eq.${encodeURIComponent(user.id)}&day=eq.${day}&select=used`);remainingAI=Math.max(0,20-(rows[0]?.used||0))}
  return json({email:user.email,...e,remainingAI,canManageBilling:!!e.subscriptionId});
 }
 if(route==='/api/ai'&&req.method==='POST')return json(await ai(user,await jsonBody(req,4000000)));
 if(route==='/api/billing/checkout'&&req.method==='POST'){
  const b=await jsonBody(req);const choice=b.plan==='pass'?'pass':b.plan==='pro'?'pro':null;
  if(!choice)throw bad(400,'Formule inconnue.');
  const price=choice==='pro'?PRO_PRICE:PASS_PRICE;
  const priceDetails=await stripeRequest('prices/'+encodeURIComponent(price),null,'GET');
  const expected=choice==='pro'?99:59;
  if(priceDetails.currency!=='eur'||priceDetails.unit_amount!==expected||(choice==='pro'&&priceDetails.recurring?.interval!=='month')||(choice==='pass'&&priceDetails.type!=='one_time'))throw bad(503,'Tarif Stripe incorrect.');
  const e=await entitlement(user.id);if(choice==='pro'&&['pro','promo'].includes(e.plan))throw bad(409,'Vous êtes déjà abonné Pro.');
  const origin=siteOrigin(req);
  const params={mode:choice==='pro'?'subscription':'payment','line_items[0][price]':price,'line_items[0][quantity]':'1',client_reference_id:user.id,success_url:origin+'/premium.html?payment=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/premium.html?payment=cancel','metadata[user_id]':user.id,'metadata[plan]':choice,allow_promotion_codes:'false',locale:'fr'};
  if(e.customerId)params.customer=e.customerId;else params.customer_email=user.email;
  if(choice==='pro')params['subscription_data[metadata][user_id]']=user.id;
  params['branding_settings[display_name]']='SimpleCVTool';
  const checkout=await stripeRequest('checkout/sessions',params);
  return json({url:checkout.url});
 }
 if(route==='/api/billing/confirm'&&req.method==='POST'){
  const b=await jsonBody(req);
  if(!/^cs_[a-zA-Z0-9_]+$/.test(String(b.sessionId||'')))throw bad(400,'Identifiant de paiement incorrect.');
  const session=await stripeRequest('checkout/sessions/'+encodeURIComponent(b.sessionId),null,'GET');
  await paidCheckout(session,user.id);
  return json({ok:true,...await entitlement(user.id)});
 }
 if(route==='/api/billing/portal'&&req.method==='POST'){
  const e=await entitlement(user.id);if(!e.customerId)throw bad(404,'Aucun client Stripe associé à ce compte.');
  const portal=await stripeRequest('billing_portal/sessions',{customer:e.customerId,return_url:siteOrigin(req)+'/compte.html'});
  return json({url:portal.url});
 }
 throw bad(404,'Route API inconnue.');
}
// Accès public aux webhooks/CAPTCHA ; contrôle des JWT réalisé sur chaque route privée.
Deno.serve(async req=>{
 try{return await route(req)}catch(e){
  const status=e?.status>=400&&e.status<600?e.status:500;
  console.error(`${req.method} ${new URL(req.url).pathname}`,status,status===500?'Erreur interne':e.message);
  return json({error:status===500?'Erreur du serveur. Réessayez.':e.message},status);
 }
});
