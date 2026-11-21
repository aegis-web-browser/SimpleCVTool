'use strict';
// Le navigateur communique avec /api/* sur le même domaine ;
// l'API Groq et les clés Stripe ne sont JAMAIS appelées côté client.
globalThis.ApiClient={base:'',url:x=>x,request:async(path,options={})=>{
 const token=await Store.token();const r=await fetch(path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
 const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||`Erreur HTTP ${r.status}`);return v;
}};
