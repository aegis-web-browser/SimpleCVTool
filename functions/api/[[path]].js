// Cloudflare Pages Functions : proxy vers Supabase Edge Functions.
// Aucun secret ni requête vers Render : authentification vérifiée par le backend.
const EDGE_URL='https://dcobmfocksjbbthsdnbh.supabase.co/functions/v1/simplecv-api';
export async function onRequest({request}){
 const incoming=new URL(request.url);
 if(!incoming.pathname.startsWith('/api/'))return new Response('Introuvable',{status:404});
 const target=EDGE_URL+incoming.pathname+incoming.search;
 const headers=new Headers();
 for(const name of ['authorization','content-type','stripe-signature','accept']){
  const value=request.headers.get(name);if(value)headers.set(name,value);
 }
 headers.set('x-request-site',incoming.origin);
 headers.set('x-client-ip',request.headers.get('cf-connecting-ip')||'unknown');
 try{
  const response=await fetch(target,{
   method:request.method,headers,
   body:['GET','HEAD'].includes(request.method)?undefined:request.body,
   redirect:'manual'
  });
  const responseHeaders=new Headers();
  for(const name of ['content-type','cache-control']){
   const value=response.headers.get(name);if(value)responseHeaders.set(name,value);
  }
  responseHeaders.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,headers:responseHeaders});
 }catch(error){
  console.error('API Supabase indisponible',String(error));
  return Response.json({error:'Service temporairement indisponible. Réessayez dans quelques instants.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
