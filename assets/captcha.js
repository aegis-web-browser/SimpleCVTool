// CAPTCHA local vérifié par le serveur, sans pisteur externe.
'use strict';
globalThis.SimpleCaptcha=(()=>{
 let id='';
 async function refresh(){
  id='';
  const image=document.getElementById('captchaImage'),status=document.getElementById('captchaStatus'),input=document.getElementById('captchaAnswer');
  if(!image||!status||!input)return;
  image.removeAttribute('src');status.textContent='Chargement d’un nouveau code…';
  input.value='';
  const resp=await fetch('/api/auth/captcha',{cache:'no-store'});
  const payload=await resp.json().catch(()=>({}));
  if(!resp.ok||!payload.captchaId||!payload.image){status.textContent=payload.error||'CAPTCHA indisponible, actualisez la page.';throw Error(status.textContent)}
  id=payload.captchaId;image.src=payload.image;
  status.textContent='Le code reste valide 5 minutes. Une erreur ? Cliquez sur « Autre code ».';
 }
 function init(){const button=document.getElementById('captchaRefresh');if(!button)return;button.addEventListener('click',()=>refresh().catch(()=>{}));refresh().catch(()=>{});}
 document.addEventListener('DOMContentLoaded',init,{once:true});
 return {get id(){return id},refresh};
})();
