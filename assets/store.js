// SimpleCVTool v4 — Supabase Auth + documents PostgreSQL (RLS).
// Les clés secrètes restent exclusivement sur le serveur.
'use strict';
globalThis.Store=(()=>{
 const KEY='simplecvtool.v4.session';
 let session=null, person=null, data={cvs:[]};
 const config=()=>globalThis.SIMPLECV_PUBLIC||{};
 const sb=(endpoint)=>{const c=config();if(!c.url||!c.anonKey)throw Error('Supabase n’est pas encore configuré : renseignez le fichier .env du serveur.');return c.url.replace(/\/$/,'')+endpoint};
 async function query(endpoint,{method='GET',body,accessToken,headers={}}={}){
  const c=config();const r=await fetch(sb(endpoint),{method,headers:{'Content-Type':'application/json',apikey:c.anonKey,...(accessToken?{Authorization:'Bearer '+accessToken}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.msg||v.error_description||v.message||v.error||`Erreur Supabase : ${r.status}`);return v;
 }
 function remember(s){session=s;person=s?.user||person;localStorage.setItem(KEY,JSON.stringify(s))}
 function clear(){session=null;person=null;data={cvs:[]};localStorage.removeItem(KEY)}
 async function token(){
  if(!session)throw Error('Session fermée, reconnectez-vous.');
  if(session.expires_at&&session.expires_at*1000-Date.now()<90000){
   if(!session.refresh_token)throw Error('Session expirée.');
   const next=await query('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
   remember(next);
  }
  return session.access_token;
 }
 async function register(email,password){
  const v=await query('/auth/v1/signup',{method:'POST',body:{email:email.trim().toLowerCase(),password}});
  if(!v.access_token){throw Error('Compte créé. Vérifiez votre boîte e-mail et cliquez sur le lien de confirmation avant de vous connecter.');}
  remember(v);data={cvs:[]};return data;
 }
 async function login(email,password){
  const v=await query('/auth/v1/token?grant_type=password',{method:'POST',body:{email:email.trim().toLowerCase(),password}});
  remember(v);await load();return data;
 }
 async function load(){
  if(!session)return false;
  const t=await token();const u=await query('/auth/v1/user',{accessToken:t});person=u;
  const rows=await query('/rest/v1/user_documents?user_id=eq.'+encodeURIComponent(u.id)+'&select=content',{accessToken:t});
  data=rows?.[0]?.content&&Array.isArray(rows[0].content.cvs)?rows[0].content:{cvs:[]};return true;
 }
 async function resume(){
  try{if(!config().url||!config().anonKey)return false;const raw=localStorage.getItem(KEY);if(!raw)return false;session=JSON.parse(raw);if(!session?.access_token)return false;return await load()}
  catch(e){console.warn('Session Supabase indisponible:',e.message);clear();return false}
 }
 async function save(next){
  if(!person?.id)throw Error('Vous devez être connecté pour enregistrer votre CV.');
  const snapshot=structuredClone(next);if(!Array.isArray(snapshot.cvs))throw Error('Format CV incorrect.');
  if(JSON.stringify(snapshot).length>1800000)throw Error('Sauvegarde trop volumineuse : réduisez la taille des photos.');
  const t=await token();
  await query('/rest/v1/user_documents?on_conflict=user_id',{method:'POST',accessToken:t,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:[{user_id:person.id,content:snapshot,updated_at:new Date().toISOString()}]});
  data=snapshot;return data;
 }
 async function logout(){
  try{if(session?.access_token)await query('/auth/v1/logout',{method:'POST',accessToken:session.access_token})}catch(e){console.warn('Déconnexion Supabase:',e.message)}clear();
 }
 return {register,login,resume,save,logout,token,get user(){return person?.email||session?.user?.email||''},get userId(){return person?.id||session?.user?.id||''},get data(){return data}};
})();
