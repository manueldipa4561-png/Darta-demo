/* Darta salon page: the barber scans the QR on the customer's Darta Card (or types the 8 characters under it) and adds a stamp.
   The server ("darta-wallet" function, POST /salon) checks the salon PIN, counts the stamp and refreshes the wallet passes. */
(()=>{
'use strict';
const FN='https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-wallet/salon';
const KEY='darta-salon-pin';
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MESSAGES={
  wrong_pin:'PIN sbagliato. Inseriscilo di nuovo.',
  bad_code:'Numero tessera non valido: servono gli 8 caratteri sotto il QR.',
  not_found:'Nessuna tessera con questo numero.',
  ambiguous:'Più tessere iniziano così: scansiona il QR.',
  too_soon:'Questa tessera ha già il timbro di oggi.',
  card_full:'Tessera completa: il prossimo taglio è omaggio.',
  not_full:'La tessera non è ancora completa.',
  too_many_requests:'Troppe richieste ravvicinate. Aspetta qualche minuto.',
  not_configured:'Timbri non ancora attivi sul server.',
};
const FALLBACK='Non riesco a timbrare. Controlla la connessione e riprova.';

/** What a scan or the keyboard gave us, as the server wants it: the full id, or the 8 characters printed under the QR. */
function code(text){
  const t=String(text||'').trim();
  const m=t.match(UUID);
  if(m)return m[0].toLowerCase();
  const s=t.replace(/[\s-]/g,'').toLowerCase();
  return /^[0-9a-f]{8}$/.test(s)?s:null;
}

async function send(body){
  let res,json={};
  try{
    res=await fetch(FN,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    json=await res.json().catch(()=>({}));
  }catch(e){throw Object.assign(new Error('network'),{code:'network'})}
  if(!res.ok)throw Object.assign(new Error(json.error||'stamp_unavailable'),{code:json.error||'stamp_unavailable',card:json.name?json:null});
  return json;
}

const store={
  get(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}},
  set(v){try{v?localStorage.setItem(KEY,v):localStorage.removeItem(KEY)}catch(e){}},
};

window.DARTA_SALON={code,send,message:e=>MESSAGES[e&&e.code]||FALLBACK};
if(typeof document==='undefined'||!document.getElementById('stamp'))return;

const $=id=>document.getElementById(id);
const pinForm=$('pin'),stampForm=$('stamp'),result=$('result'),msg=$('msg');
let pin=store.get(),last=null;

function show(){pinForm.hidden=!!pin;stampForm.hidden=!pin;$('out').hidden=!pin;if(!pin)$('pin-in').focus()}
function say(text,bad){msg.textContent=text;msg.classList.toggle('bad',!!bad)}
function card(c,note){
  result.hidden=false;
  $('who').textContent=c.name;
  $('count').textContent=`${c.stamps} / ${c.goal}`;
  $('dots').replaceChildren(...Array.from({length:c.goal},(_,i)=>{const d=document.createElement('i');if(i<c.stamps)d.className='on';return d}));
  $('note').textContent=note;
  $('redeem').hidden=c.stamps<c.goal;
}

async function go(action){
  const c=code($('code').dataset.full||$('code').value);
  if(!c){say(MESSAGES.bad_code,true);$('code').focus();return}
  const btns=document.querySelectorAll('button');
  btns.forEach(b=>b.disabled=true);
  say(action==='redeem'?'Azzero la tessera…':'Timbro…');
  try{
    const r=await send({pin,code:c,action,barber:$('barber').value||undefined});
    last=c;
    const w=r.wallets||{};
    const where=[w.apple?'Apple Wallet':'',w.google?'Google Wallet':''].filter(Boolean).join(' e ');
    card(r,where?`Aggiornata su ${where}.`:'Il pass si aggiorna appena il telefono è online.');
    say(action==='redeem'?'Taglio omaggio registrato, tessera azzerata.':'Timbro aggiunto.');
    $('code').value='';delete $('code').dataset.full;
  }catch(e){
    if(e.code==='wrong_pin'){pin='';store.set('');show()}
    if(e.card)card(e.card,'');
    say(window.DARTA_SALON.message(e),true);
  }finally{btns.forEach(b=>b.disabled=false)}
}

pinForm.addEventListener('submit',e=>{e.preventDefault();pin=$('pin-in').value.trim();$('pin-in').value='';if(pin){store.set(pin);say('');show()}});
stampForm.addEventListener('submit',e=>{e.preventDefault();go('stamp')});
$('redeem').addEventListener('click',()=>{if(last){$('code').dataset.full=last;go('redeem')}});
$('out').addEventListener('click',()=>{pin='';store.set('');result.hidden=true;say('');show()});

// The camera scanner where the browser can read QR codes (Chrome on Android, for example); everywhere else the code is typed.
// ponytail: no QR library for iPhone Safari (no BarcodeDetector there); vendor jsQR if the salon stamps from an iPhone often
if('BarcodeDetector' in window&&navigator.mediaDevices){
  const scan=$('scan'),video=$('cam');
  scan.hidden=false;
  let stream=null;
  const stop=()=>{if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.hidden=true;scan.textContent='Scansiona il QR'};
  scan.addEventListener('click',async()=>{
    if(stream){stop();return}
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false})}
    catch(e){say('Fotocamera non disponibile: scrivi il numero.',true);return}
    video.srcObject=stream;video.hidden=false;await video.play();scan.textContent='Chiudi fotocamera';
    const det=new BarcodeDetector({formats:['qr_code']});
    const tick=async()=>{
      if(!stream)return;
      const hit=(await det.detect(video).catch(()=>[])).map(b=>code(b.rawValue)).find(Boolean);
      if(hit){stop();$('code').value=hit.slice(0,8).toUpperCase();$('code').dataset.full=hit;go('stamp');return}
      setTimeout(tick,250);
    };
    tick();
  });
}
// the full id from a scan beats the 8 characters: no "ambiguous" answer possible
$('code').addEventListener('input',()=>delete $('code').dataset.full);
show();
})();
