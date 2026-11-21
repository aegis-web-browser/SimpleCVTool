
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {checkStripeSignature}=require('../server/index.cjs');
test('signature Stripe : empreinte HMAC correcte, signature incorrecte et ancien événement',()=>{
 const prev=process.env.STRIPE_WEBHOOK_SECRET;
 process.env.STRIPE_WEBHOOK_SECRET='whsec_test_local_only';
 try {
  const raw=JSON.stringify({id:'evt_test_local',type:'checkout.session.completed'});
  const timestamp=Math.floor(Date.now()/1000);
  const sign=(t,payload)=>`t=${t},v1=${crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')}`;
  assert.doesNotThrow(()=>checkStripeSignature(raw,sign(timestamp,raw)));
  assert.throws(()=>checkStripeSignature(raw+' ',sign(timestamp,raw)),/Signature Stripe invalide/);
  assert.throws(()=>checkStripeSignature(raw,sign(timestamp-900,raw)),/Horodatage Stripe invalide/);
 } finally {
  if(prev===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET=prev;
 }
});
