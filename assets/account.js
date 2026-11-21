// État Premium vérifié par le serveur ; aucun code de déblocage navigateur.
'use strict';
globalThis.Account=(()=>{
 let state={authenticated:false,premium:false,plan:'free',email:'',freeAIUsed:0,canManageBilling:false,expiresAt:null};
 async function request(path,{method='GET',body}={}){
  const token=await Store.token();
  const resp=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const result=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(result.error||'Erreur du serveur.');return result;
 }
 async function refresh(){
  state={authenticated:!!Store.user,premium:false,plan:'free',email:Store.user,freeAIUsed:0,canManageBilling:false,expiresAt:null};
  if(!Store.user)return state;
  try{const a=await request('/api/account');state={authenticated:true,...a}}catch(e){console.warn('État abonnement indisponible:',e.message)}
  return state;
 }
 async function api(path,opts={}){return request(path,opts)}
 async function confirm(sessionId){const result=await request('/api/billing/confirm',{method:'POST',body:{sessionId}});await refresh();return result}
 return {api,refresh,confirm,get state(){return state}};
})();
