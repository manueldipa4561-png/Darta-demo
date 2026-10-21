/* Darta pay: the shop's link to the Supabase Edge Functions that create Stripe Checkout sessions.
   Until Stripe keys are set on the server, the functions answer { live: false } and the shop stays in demo mode.
   Card details never touch this site: the customer pays on Stripe's own page (cards, Apple Pay, Google Pay). */
(()=>{
'use strict';
const D=window.DARTA;
const FN='https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1';
const STRIPE_HOST='https://checkout.stripe.com/';
const SESSION=/^cs_(test|live)_[A-Za-z0-9_]{8,200}$/;
// Demo mode must be switched on explicitly (<meta name="darta-demo"> in every page). Remove the meta at go-live: from then on a
// server that says "payments are off" is treated as a fault, never as a pretend order that charges nothing.
const DEMO=!!document.querySelector('meta[name="darta-demo"]');

const MESSAGES={
  digital_unsupported:'Gift card e abbonamento per ora si acquistano in salone. Toglili dal carrello per pagare online.',
  bad_coupon:'Questo codice sconto non è più valido. Toglilo dal carrello e riprova.',
  below_minimum:'L’importo minimo per il pagamento online è 5 €.',
  too_many_requests:'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.',
  unknown_product:'Un prodotto del carrello non è più disponibile. Aggiorna il carrello.',
  bad_variant:'Un prodotto del carrello non è più disponibile. Aggiorna il carrello.',
  not_configured:'Il pagamento online non è ancora attivo.',
  unknown_plan:'Questo abbonamento non è più disponibile. Aggiorna la pagina.'
};
const FALLBACK='Non riesco ad aprire il pagamento. Riprova tra poco o scrivici su WhatsApp.';

let known=null;   // 'live' | 'demo' once the server has answered; faults are not remembered
/** 'live' (real payments on), 'demo' (payments off AND this site is marked as a demo) or 'unknown' (anything else). */
function mode(){
  if(known)return Promise.resolve(known);
  return fetch(FN+'/darta-checkout',{signal:AbortSignal.timeout(4000)})
    .then(r=>r.ok?r.json():Promise.reject(new Error('probe '+r.status)))
    .then(j=>j&&j.live===true?(known='live'):DEMO?(known='demo'):'unknown')
    .catch(()=>'unknown');
}

/** Sends the cart (ids and quantities only; the server prices it) and returns Stripe's hosted checkout URL. */
async function start(){
  const S=D.store,t=S.totals();
  const body={lines:S.lines.map(l=>({id:l.id,v:l.v,q:l.q})),coupon:S.coupon,mode:t.ship?'ship':'pickup',lang:D.lang};
  let res,json={};
  try{
    res=await fetch(FN+'/darta-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    json=await res.json().catch(()=>({}));
  }catch(e){throw Object.assign(new Error('network'),{code:'network'})}
  if(res.ok&&typeof json.url==='string'&&json.url.startsWith(STRIPE_HOST))return json.url;
  throw Object.assign(new Error(json.error||'payment_unavailable'),{code:json.error||'payment_unavailable'});
}

/** Starts a monthly Darta Club membership (plan id only: the server knows the price) and returns Stripe's hosted page. */
async function subscribe(plan){
  let res,json={};
  try{
    res=await fetch(FN+'/darta-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,lang:D.lang}),signal:AbortSignal.timeout(20000)});
    json=await res.json().catch(()=>({}));
  }catch(e){throw Object.assign(new Error('network'),{code:'network'})}
  if(res.ok&&typeof json.url==='string'&&json.url.startsWith(STRIPE_HOST))return json.url;
  throw Object.assign(new Error(json.error||'payment_unavailable'),{code:json.error||'payment_unavailable'});
}

// every "Attiva" button of the Darta Club plans (home and shop)
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-plan]');
  if(!b||b.disabled)return;
  b.disabled=true;
  const m=await mode();
  if(m!=='live'){
    D.toast(D.t(m==='demo'?'Demo: qui il cliente attiva l’abbonamento e paga con Stripe. Si accende con l’account Stripe del salone.':FALLBACK));
    b.disabled=false;return;
  }
  try{location.href=await subscribe(b.dataset.plan)}
  catch(ex){D.toast(D.t(MESSAGES[ex.code]||FALLBACK));b.disabled=false}
});

/** Summary of a paid order for the thank-you page (no personal data comes back). */
async function order(sessionId){
  if(!SESSION.test(sessionId))return {error:'bad_session'};
  try{
    const res=await fetch(FN+'/darta-order?s='+encodeURIComponent(sessionId),{signal:AbortSignal.timeout(10000)});
    const json=await res.json().catch(()=>({}));
    return res.ok?json:{error:json.error||'unavailable'};
  }catch(e){return {error:'network'}}
}

D.pay={mode,start,subscribe,order,message:err=>D.t(MESSAGES[err&&err.code]||FALLBACK)};
})();
