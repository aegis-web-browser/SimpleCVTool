'use strict';
// SimpleCVTool v4 — backend sans dépendance externe (Node >= 20).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {makeCaptcha,checkCaptcha}=require('./captcha.cjs');
const root = path.resolve(__dirname,'..');
for (const line of (fs.existsSync(path.join(root,'.env')) ? fs.readFileSync(path.join(root,'.env'),'utf8') : '').split(/\r?\n/)) {
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2].trim();
}
const env=process.env;
const PORT=Number(env.PORT||5500);
const SITE=(env.APP_URL||env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const SB=(env.SUPABASE_URL||'').replace(/\/$/,'');
const ANON=env.SUPABASE_ANON_KEY||'';
const SERVICE=env.SUPABASE_SERVICE_ROLE_KEY||'';
const GROQ=env.GROQ_API_KEY||'';
const MODEL=env.GROQ_MODEL||'openai/gpt-oss-20b';
const STRIPE=env.STRIPE_SECRET_KEY||'';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const PUBLIC=new Set(['/index.html','/connexion.html','/inscription.html','/dashboard.html','/editeur.html','/modeles.html','/premium.html','/compte.html','/mentions.html']);
const send=(res,status,data,headers={})=>{
  const json=typeof data!=='string' && !Buffer.isBuffer(data);
  res.writeHead(status,{'Content-Type':json?'application/json; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(json?JSON.stringify(data):data);
};
const bad=(s,message)=>Object.assign(Error(message),{status:s});
async function jsonBody(req,limit=102400){let length=0,chunks=[];for await(const c of req){length+=c.length;if(length>limit)throw bad(413,'Texte trop volumineux.');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw bad(400,'JSON invalide.')}}
async function remote(url,opts={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  try{const resp=await fetch(url,{...opts,signal:controller.signal});const text=await resp.text();let result;try{result=JSON.parse(text)}catch{result={message:text.slice(0,500)}};
  if(!resp.ok)throw bad(resp.status,result.error?.message||result.message||`Erreur du fournisseur (${resp.status}).`);
  return result;
  }finally{clearTimeout(timeout)}
}
function sbHeaders(key=SERVICE){const headers={apikey:key,'Content-Type':'application/json'};if(!String(key).startsWith('sb_secret_')&&!String(key).startsWith('sb_publishable_'))headers.Authorization='Bearer '+key;return headers}
async function admin(table,opts={}){if(!SB||!SERVICE)throw bad(503,'Supabase doit être configuré sur le serveur.');return remote(`${SB}/rest/v1/${table}`,{...opts,headers:{...sbHeaders(),...(opts.headers||{})}})}
async function verifyUser(req){
 if(!SB||!ANON)throw bad(503,'Supabase Auth n’est pas configuré.');
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw bad(401,'Connectez-vous pour continuer.');
 const user=await remote(`${SB}/auth/v1/user`,{headers:{apikey:ANON,Authorization:'Bearer '+token}}).catch(()=>{throw bad(401,'Votre session a expiré. Reconnectez-vous.')});
 if(!user?.id)throw bad(401,'Session invalide.');return user;
}
async function entitlement(id){
 const rows=await admin(`entitlements?user_id=eq.${encodeURIComponent(id)}&select=*`);
 const e=rows[0]||{};const active=(e.plan==='pro'||e.plan==='pass') && e.access_until && Date.parse(e.access_until)>Date.now();
 return {plan:active?e.plan:'free',premium:!!active,expiresAt:active?e.access_until:null,freeAIUsed:e.free_ai_used||0,customerId:e.stripe_customer_id||null,subscriptionId:e.stripe_subscription_id||null};
}
async function saveEntitlement(id,update){
 return admin(`entitlements?on_conflict=user_id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{user_id:id,...update}])});
}
async function stripeRequest(endpoint,params,method='POST'){
 if(!STRIPE)throw bad(503,'Stripe n’est pas configuré.');
 return remote(`https://api.stripe.com/v1/${endpoint}`,{method,headers:{Authorization:'Bearer '+STRIPE,'Content-Type':'application/x-www-form-urlencoded'},...(params?{body:new URLSearchParams(params).toString()}:{})});
}
async function paidCheckout(s,id){
 if(s.client_reference_id!==id||s.status!=='complete'||!['paid','no_payment_required'].includes(s.payment_status))throw bad(409,'Ce paiement n’est pas encore confirmé ou ne correspond pas à votre compte.');
 const customer=typeof s.customer==='string'?s.customer:s.customer?.id;
 const opts={stripe_customer_id:customer||null};
 if(s.mode==='payment'&&s.metadata?.plan==='pass'){
  // L'expiration est calculée depuis la date de paiement, pas depuis chaque appel confirm.
  const until=new Date((Number(s.created)||0)*1000+3*86400000).toISOString();
  const previous=await entitlement(id);
  if(previous.plan!=='pro'&&Date.parse(until)>Date.now())await saveEntitlement(id,{...opts,plan:'pass',access_until:until});
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
 const active=['active','trialing'].includes(s.status);
 const seconds=Number(s.items?.data?.[0]?.current_period_end||s.current_period_end||0);
 const until=seconds?new Date(seconds*1000).toISOString():null;
 if(active&&until&&Date.parse(until)>Date.now())await saveEntitlement(uid,{plan:'pro',access_until:until,stripe_subscription_id:sid,stripe_customer_id:typeof s.customer==='string'?s.customer:s.customer?.id});
 else await saveEntitlement(uid,{plan:'free',access_until:null,stripe_subscription_id:sid,stripe_customer_id:typeof s.customer==='string'?s.customer:s.customer?.id});
}
function checkStripeSignature(raw,signature){
 const secret=env.STRIPE_WEBHOOK_SECRET||'';if(!secret)throw bad(503,'STRIPE_WEBHOOK_SECRET manquant.');
 const parts=Object.fromEntries(String(signature||'').split(',').map(x=>x.split('=')));
 const ts=Number(parts.t||0);if(!ts||Math.abs(Date.now()/1000-ts)>300)throw bad(400,'Horodatage Stripe invalide.');
 const digest=crypto.createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex');
 const hits=String(signature||'').split(',').filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
 if(!hits.some(x=>/^[0-9a-f]{64}$/.test(x)&&crypto.timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(x,'hex'))))throw bad(400,'Signature Stripe invalide.');
}
async function handleWebhook(req,res){
 let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>1500000)throw bad(413,'Événement Stripe trop volumineux.');chunks.push(c)}
 const raw=Buffer.concat(chunks).toString('utf8');checkStripeSignature(raw,req.headers['stripe-signature']);
 const event=JSON.parse(raw);const seen=await admin(`stripe_events?id=eq.${encodeURIComponent(event.id)}&select=id`);if(seen.length)return send(res,200,{received:true});
 const s=event.data?.object||{};
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&s.client_reference_id&&s.payment_status==='paid'){
  await paidCheckout(s,s.client_reference_id);
 }
 // Un Checkout asynchrone encore impayé ne doit jamais débloquer un accès.
 // Les événements de paiement refusé sont enregistrés sans attribution de droits.
 if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))await updateSubscription(s);
 await admin('stripe_events',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify([{id:event.id}])});
 send(res,200,{received:true});
}
const instruction=`Tu es un rédacteur français expert en CV. Produit uniquement un objet JSON, sans Markdown, au format {"title":"CV — ...","person":{"name":"","role":"","tagline":"","email":"","phone":"","city":"","linkedin":""},"sections":[{"type":"profile|experience|education|skills|languages|projects|certifications|interests","title":"","text":"","items":[{"title":"","organization":"","location":"","start":"","end":"","current":false,"text":"","url":""}]}]}. Utilise uniquement les informations communiquées. Ne fabrique jamais de diplôme, poste, date, employeur ou compétence. Améliore clarté et lisibilité sans enjoliver. Conserve la langue française, sauf si l'utilisateur demande une autre langue. Pour les expériences, utilise les items. Les titres doivent être professionnels. Donne des formulations directes, concises et adaptées aux recruteurs.`;
async function ai(req,user,body){
 if(!GROQ)throw bad(503,'La clé Groq doit être configurée sur le serveur.');
 const mode=body.mode==='improve'?'improve':'generate';const prompt=typeof body.prompt==='string'?body.prompt.trim():'';
 const context=mode==='improve'?JSON.stringify(body.cv||{}):prompt;
 if(context.length<30||context.length>16000)throw bad(400,'Fournissez entre 30 et 16 000 caractères pour l’IA.');
 // RPC transactionnelle : protège les quotas contre les requêtes parallèles.
 const reserved=await admin('rpc/reserve_ai_use',{method:'POST',body:JSON.stringify({p_user_id:user.id})});
 if(!reserved?.allowed)throw bad(429,reserved?.message||'Votre quota IA est atteint.');
 try {
  const request={model:MODEL,temperature:0.25,max_completion_tokens:3500,reasoning_effort:'low',reasoning_format:'hidden',response_format:{type:'json_object'},messages:[{role:'system',content:instruction},{role:'user',content:(mode==='improve'?'Réorganise et améliore le CV fourni en préservant scrupuleusement les faits : ':'Construis un CV professionnel à partir de ces informations : ')+context}]};
  const out=await remote('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},body:JSON.stringify(request)});
  const content=out?.choices?.[0]?.message?.content;let cv;
  try{cv=JSON.parse(content)}catch{throw bad(502,'La réponse IA n’est pas un JSON exploitable. Réessayez.')}
  if(!cv||!Array.isArray(cv.sections)||!cv.sections.length)throw bad(502,'L’IA n’a pas renvoyé de rubriques valides.');
  return {cv,model:MODEL,usage:out.usage||{},remaining:reserved.remaining};
 }catch(err){
  try{await admin('rpc/refund_ai_use',{method:'POST',body:JSON.stringify({p_user_id:user.id,p_plan:reserved.plan})})}catch(e){console.error('Quota refund:',e.message)}
  if(err.status===429)throw bad(429,'Le quota temporaire Groq est atteint. Réessayez ultérieurement.');
  throw err;
 }
}
// Inscription sans courrier de confirmation : la clé administrateur est exclusivement côté serveur.
// Cette fonctionnalité est réservée au site, limitée par adresse IP et globalement.
const signupAttempts=new Map();
let globalSignups=[];
function signupRateLimit(req){
 const now=Date.now(),windowMs=3600000;
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
 const addr=(forwarded||req.socket.remoteAddress||'unknown').slice(0,128);
 const last=(signupAttempts.get(addr)||[]).filter(t=>now-t<windowMs);
 globalSignups=globalSignups.filter(t=>now-t<windowMs);
 if(last.length>=5||globalSignups.length>=100)throw bad(429,'Trop de créations de comptes. Réessayez plus tard.');
 last.push(now);signupAttempts.set(addr,last);globalSignups.push(now);
 if(signupAttempts.size>10000){
   for(const [key,times] of signupAttempts)if(times.every(t=>now-t>=windowMs))signupAttempts.delete(key);
 }
}
async function immediateRegistration(req,res){
 if(!SB||!ANON||!SERVICE)throw bad(503,'Inscription temporairement indisponible.');
 const origin=req.headers.origin;
 if(origin&&origin!==new URL(SITE).origin)throw bad(403,'Origine de la requête non autorisée.');
 const body=await jsonBody(req,4096);
 if(typeof body.website==='string'&&body.website.trim())throw bad(400,'Formulaire invalide.');
 checkCaptcha(body,bad);
 signupRateLimit(req);
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 const password=typeof body.password==='string'?body.password:'';
 if(email.length>180||!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email))
   throw bad(400,'Adresse e-mail incorrecte.');
 if(password.length<12||password.length>200)throw bad(400,'Le mot de passe doit contenir entre 12 et 200 caractères.');
 try{
  await remote(`${SB}/auth/v1/admin/users`,{
   method:'POST',headers:sbHeaders(),body:JSON.stringify({email,password,email_confirm:true})
  });
 }catch(e){
  if(e.status===422||e.status===409)throw bad(409,'Cette adresse e-mail ne peut pas être utilisée pour une nouvelle inscription. Essayez de vous connecter.');
  console.error('Création de compte Supabase :',e.status||500);
  throw bad(503,'Inscription momentanément indisponible.');
 }
 const session=await remote(`${SB}/auth/v1/token?grant_type=password`,{
   method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},
   body:JSON.stringify({email,password})
 });
 if(!session?.access_token||!session.user?.id)throw bad(502,'Compte créé. Essayez de vous connecter.');
 return send(res,201,session);
}

async function route(req,res){
 const u=new URL(req.url,SITE),route=u.pathname;
 if(route==='/api/health')return send(res,200,{ok:true,supabaseConfigured:!!(SB&&ANON&&SERVICE),groqConfigured:!!GROQ,stripeConfigured:!!STRIPE});
 if(route==='/api/public-config.js')return send(res,200,`window.SIMPLECV_PUBLIC=${JSON.stringify({url:SB,anonKey:ANON})};`,{'Content-Type':'text/javascript; charset=utf-8'});
 if(route==='/api/auth/captcha'&&req.method==='GET')return makeCaptcha(req,res,send,bad);
 if(route==='/api/stripe/webhook'&&req.method==='POST')return handleWebhook(req,res);
 if(route==='/api/auth/register'&&req.method==='POST')return immediateRegistration(req,res);
 if(route.startsWith('/api/')){
  const user=await verifyUser(req);
  if(route==='/api/account'&&req.method==='GET'){
   const e=await entitlement(user.id);let remainingAI=Math.max(0,1-e.freeAIUsed);
   if(e.premium){const today=new Date().toISOString().slice(0,10);const rows=await admin(`ai_daily_usage?user_id=eq.${encodeURIComponent(user.id)}&day=eq.${today}&select=used`);remainingAI=Math.max(0,20-(rows[0]?.used||0))}
   return send(res,200,{email:user.email,...e,remainingAI,canManageBilling:!!e.subscriptionId})
  }
  if(route==='/api/ai'&&req.method==='POST'){const b=await jsonBody(req,40000);return send(res,200,await ai(req,user,b))}
  if(route==='/api/billing/checkout'&&req.method==='POST'){
   const b=await jsonBody(req),choice=b.plan==='pass'?'pass':b.plan==='pro'?'pro':null;
   if(!choice)throw bad(400,'Formule inconnue.');const price=choice==='pro'?env.STRIPE_PRICE_ID_PRO:env.STRIPE_PRICE_ID_PASS;
   if(!price)throw bad(503,'Identifiant de tarif Stripe absent.');
   const priceDetails=await stripeRequest('prices/'+encodeURIComponent(price),null,'GET');
   const expected=choice==='pro'?99:59;
   if(priceDetails.currency!=='eur'||priceDetails.unit_amount!==expected||(choice==='pro'&&(priceDetails.recurring?.interval!=='month'||priceDetails.recurring?.interval_count!==1))||(choice==='pass'&&priceDetails.type!=='one_time'))
    throw bad(503,'Le tarif Stripe configuré ne correspond pas à la formule affichée sur le site.');
   const e=await entitlement(user.id);if(choice==='pro'&&e.plan==='pro')throw bad(409,'Vous êtes déjà abonné Pro.');
   const p={'mode':choice==='pro'?'subscription':'payment','line_items[0][price]':price,'line_items[0][quantity]':'1','client_reference_id':user.id,'success_url':SITE+'/premium.html?payment=success&session_id={CHECKOUT_SESSION_ID}','cancel_url':SITE+'/premium.html?payment=cancel','metadata[user_id]':user.id,'metadata[plan]':choice,'allow_promotion_codes':'false'};
   if(e.customerId)p.customer=e.customerId;else p.customer_email=user.email;
   if(choice==='pro')p['subscription_data[metadata][user_id]']=user.id;
   const checkout=await stripeRequest('checkout/sessions',p);return send(res,200,{url:checkout.url});
  }
  if(route==='/api/billing/confirm'&&req.method==='POST'){
   const b=await jsonBody(req);if(!/^cs_[a-zA-Z0-9_]+$/.test(String(b.sessionId||'')))throw bad(400,'Identifiant de paiement incorrect.');
   const s=await stripeRequest('checkout/sessions/'+encodeURIComponent(b.sessionId),null,'GET');await paidCheckout(s,user.id);
   return send(res,200,{ok:true,...await entitlement(user.id)});
  }
  if(route==='/api/billing/portal'&&req.method==='POST'){
   const e=await entitlement(user.id);if(!e.customerId)throw bad(404,'Aucun client Stripe associé à ce compte.');
   const portal=await stripeRequest('billing_portal/sessions',{customer:e.customerId,return_url:SITE+'/compte.html'});
   return send(res,200,{url:portal.url});
  }
  throw bad(404,'Route API inconnue.');
 }
 if(req.method!=='GET'&&req.method!=='HEAD')throw bad(405,'Méthode non autorisée.');
 const name=route==='/'?'/index.html':route;
 if(!PUBLIC.has(name) && !/^\/assets\/[A-Za-z0-9_.-]+$/.test(name))throw bad(404,'Page introuvable.');
 const filename=path.resolve(root,'.'+name);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename))throw bad(404,'Page introuvable.');
 const ext=path.extname(filename);if(!mime[ext])throw bad(404,'Fichier interdit.');
 const data=fs.readFileSync(filename);const headers={'Content-Type':mime[ext],'Cache-Control':ext==='.html'||ext==='.js'?'no-cache':'public,max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
 res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);
}
const app=http.createServer((req,res)=>route(req,res).catch(e=>{console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`,e.status||500,e.message);if(!res.headersSent)send(res,e.status>=400&&e.status<600?e.status:500,{error:e.status?e.message:'Erreur serveur. Veuillez réessayer.'})}));
if(require.main===module)app.listen(PORT,()=>console.log(`SimpleCVTool — ${SITE} (${PORT})`));
module.exports={app,checkStripeSignature};
