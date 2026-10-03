/* Darta wallet: adds the loyalty card to Apple Wallet or Google Wallet through the Supabase "darta-wallet" function.
   Until a wallet is set up on the server the function says so and the card button stays the demo message. */
(()=>{
'use strict';
const D=window.DARTA;
const FN='https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-wallet';
// the only places the browser is ever sent to: our own pass download, or Google's "save" page
const LINKS={
  apple:/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/darta-wallet\/apple\/[0-9a-f-]{36}$/,
  google:/^https:\/\/pay\.google\.com\/gp\/v\/save\/[\w.-]+$/
};
const MESSAGES={
  too_many_requests:'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.',
  bad_card:'Questa tessera non si può aggiungere. Aggiorna la pagina e riprova.'
};
const FALLBACK='Non riesco ad aggiungere la tessera. Riprova tra poco.';

let known=null;   // { apple, google } once the server has answered; faults are not remembered
/** Which wallets the server has switched on, or null when it does not answer. */
function availability(){
  if(known)return Promise.resolve(known);
  return fetch(FN,{signal:AbortSignal.timeout(4000)})
    .then(r=>r.ok?r.json():Promise.reject(new Error('probe '+r.status)))
    .then(j=>(known={apple:j.apple===true,google:j.google===true}))
    .catch(()=>null);
}

/** Saves the card on the server and returns { id, apple, google } with a link for each wallet that is on. */
async function create(card){
  let res,json={};
  try{
    res=await fetch(FN,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...card,lang:D.lang}),signal:AbortSignal.timeout(15000)});
    json=await res.json().catch(()=>({}));
  }catch(e){throw Object.assign(new Error('network'),{code:'network'})}
  if(!res.ok)throw Object.assign(new Error(json.error||'wallet_unavailable'),{code:json.error||'wallet_unavailable'});
  return json;
}

/** apple on iPhone, iPad and Safari for Mac; google on Android; 'any' when we cannot tell. */
function platform(ua=navigator.userAgent,touch=navigator.maxTouchPoints){
  if(/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&touch>1))return 'apple';
  if(/Android/.test(ua))return 'google';
  if(/Macintosh/.test(ua)&&/Safari/.test(ua)&&!/Chrome|Chromium|Edg|Firefox/.test(ua))return 'apple';
  return 'any';
}

/** The wallet to open without asking, or null when the visitor has to choose. */
function choose(av,plat){
  if(av.apple&&!av.google)return 'apple';
  if(av.google&&!av.apple)return 'google';
  if(plat!=='any'&&av[plat])return plat;
  return null;
}

D.wallet={availability,create,platform,choose,links:LINKS,message:e=>D.t(MESSAGES[e&&e.code]||FALLBACK)};
})();
