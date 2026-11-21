'use strict';
const crypto=require('node:crypto');
// CAPTCHA temporaire vérifié par le serveur : jeton aléatoire, durée de vie courte,
// réponse à usage unique. Protection complémentaire, pas un substitut à Turnstile.
const captchaChallenges=new Map();
const captchaRequests=new Map();
const captchaAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const captchaHash=value=>crypto.createHash('sha256').update(value).digest();
function clientAddress(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,128)}
// Alphabet bitmap 5x7 : le code ne figure jamais en texte brut dans le SVG.
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
 const rand=(max)=>crypto.randomInt(max);
 const lines=Array.from({length:17},()=>`<line x1="${rand(240)}" y1="${rand(90)}" x2="${rand(240)}" y2="${rand(90)}" stroke="#adc9d7" stroke-width="${1+rand(2)}" opacity=".48" />`).join('');
 const letters=[...code].map((letter,i)=>{
  const x=18+i*43+rand(7),y=16+rand(12),rotation=rand(19)-9;
  let path='';const rows=captchaGlyphs[letter].split(':');
  for(let j=0;j<rows.length;j++)for(let k=0;k<5;k++)if(rows[j][k]==='1')path+=`M${k*5} ${j*5}h4v4h-4z`;
  return `<g transform="translate(${x} ${y}) rotate(${rotation} 13 18)" fill="${i%2?'#164b78':'#162e52'}"><path d="${path}" /></g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90" viewBox="0 0 240 90"><rect width="240" height="90" rx="12" fill="#eaf5fc"/><path d="M0 70 Q 120 13 240 65" stroke="#c3d8e7" stroke-width="10" fill="none" opacity=".45"/>${lines}${letters}</svg>`;
}

function makeCaptcha(req,res,send,bad){
 const now=Date.now(),ip=clientAddress(req);
 const recent=(captchaRequests.get(ip)||[]).filter(t=>now-t<60000);
 if(recent.length>=24)throw bad(429,'Trop de CAPTCHA demandés. Réessayez dans une minute.');
 recent.push(now);captchaRequests.set(ip,recent);
 if(captchaChallenges.size>1000||captchaRequests.size>1000){
  for(const [key,item] of captchaChallenges)if(item.expiresAt<now)captchaChallenges.delete(key);
  for(const [key,times] of captchaRequests)if(times.every(t=>now-t>=60000))captchaRequests.delete(key);
 }
 if(captchaChallenges.size>=2000)throw bad(429,'Service temporairement occupé. Réessayez plus tard.');
 const id=crypto.randomBytes(20).toString('hex');
 const code=Array.from({length:5},()=>captchaAlphabet[crypto.randomInt(captchaAlphabet.length)]).join('');
 captchaChallenges.set(id,{hash:captchaHash(code),expiresAt:now+5*60*1000});
 return send(res,200,{captchaId:id,image:'data:image/svg+xml;base64,'+Buffer.from(captchaSvg(code)).toString('base64'),expiresInSeconds:300});
}
function checkCaptcha(body,bad){
 const id=typeof body.captchaId==='string'?body.captchaId:'';
 const answer=typeof body.captchaAnswer==='string'?body.captchaAnswer.toUpperCase().trim():'';
 const challenge=captchaChallenges.get(id);
 captchaChallenges.delete(id); // Chaque tentative consomme son challenge.
 if(!challenge||challenge.expiresAt<Date.now()||answer.length!==5||!crypto.timingSafeEqual(challenge.hash,captchaHash(answer)))
  throw bad(400,'CAPTCHA incorrect ou expiré. Actualisez le code et réessayez.');
}


module.exports={makeCaptcha,checkCaptcha};
