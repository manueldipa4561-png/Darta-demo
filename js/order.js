/* Darta order page: where Stripe sends the customer back to (/ordine?s=cs_...).
   Asks the server whether the session is paid, shows the summary and empties the cart only after a real payment. */
(()=>{
'use strict';
const D=window.DARTA,{$,el,eur}=D,tr=D.t;
const box=$('#ordBox');
if(!box)return;
const WA='393939031656';
const RETRY_MS=3500,MAX_TRIES=4;   // a delayed payment method (bank transfer, voucher) can take a moment to show up

const set=(title,text,{no='',items=[],link=''}={})=>{
  $('#ordTitle').textContent=title;
  $('#ordTxt').textContent=text;
  const n=$('#ordNo');n.textContent=no;n.hidden=!no;
  $('#ordList').replaceChildren(...items.map(i=>el('li',{text:`${i.q}x ${i.name}`})));
  const wa=$('#ordWa');wa.href=`https://wa.me/${WA}${no?'?text='+encodeURIComponent(tr('Ordine {no}',{no})):''}`;
  const retry=$('#ordRetry');retry.href=link||D.path.shop+D.hash.cart;retry.hidden=!link;
};

function show(o){
  if(o.paid&&o.plan){   // a membership: the shop cart is not involved, the Darta Card can go in the wallet
    set(tr('Abbonamento attivo.'),tr('{total} al mese, con rinnovo automatico. Controlla l’email: Stripe invia la ricevuta e il link per gestirlo o disdirlo. La tua Darta Card è pronta: i timbri li mette il salone a ogni taglio.',{total:eur(o.total)}),{no:o.orderNo,items:o.items});
    $('#ordCard').hidden=false;
    return true;
  }
  if(o.paid){
    D.store.clear();   // the customer has paid: the cart is done
    const ship=o.mode==='ship';
    set(tr('Grazie, ordine pagato.'),
      ship?tr('Il salone prepara il pacco e ti scrive con il tracking. Totale {total}. Controlla l’email: Stripe invia la ricevuta del pagamento.',{total:eur(o.total)})
          :tr('Lo ritiri in salone, Via Gobetti 184, da martedì a sabato dalle 10:00 alle 19:00: ti scriviamo quando è pronto. Totale {total}. Controlla l’email: Stripe invia la ricevuta del pagamento.',{total:eur(o.total)}),
      {no:o.orderNo,items:o.items});
    return true;
  }
  if(o.pending){
    set(tr('Pagamento in elaborazione.'),tr('Il tuo metodo di pagamento sta confermando l’importo. Appena arriva ti scriviamo, non serve fare altro.'),{no:o.orderNo,items:o.items});
    return false;
  }
  set(tr('Pagamento non completato.'),tr('Non è stato addebitato nulla. Il carrello è ancora lì: puoi riprovare quando vuoi.'),{link:D.path.shop+D.hash.cart});
  return true;
}

/* Darta Card to the wallet: the server issues it only for a paid subscription (the session id is the proof), always with
   0 stamps, in the look the visitor chose on the home page. */
const sessionId=()=>new URLSearchParams(location.search).get('s')||'';
function design(){
  try{const v=JSON.parse(localStorage.getItem('darta-card'))||{};return {name:v.name||'',finish:v.f||'onyx',icon:v.ic||'scissors',barber:v.b||'Thomas'}}
  catch(e){return {name:'',finish:'onyx',icon:'scissors',barber:'Thomas'}}
}
async function addToWallet(which){
  const btn=$('#ordWallet'),txt=btn.textContent;
  $('#ordPick').hidden=true;btn.disabled=true;btn.textContent=tr('Preparo la tessera…');
  try{
    const made=await D.wallet.create({...design(),stamps:0,session:sessionId()});
    const url=made[which];
    if(typeof url!=='string'||!D.wallet.links[which].test(url))throw new Error('no link');
    location.href=url;   // iPhone: the Add to Wallet sheet; Android: Google's save page
  }catch(e){D.toast(D.wallet.message(e))}
  finally{btn.disabled=false;btn.textContent=txt}
}
const wb=$('#ordWallet');
if(wb){
  wb.onclick=async()=>{
    const av=D.wallet&&await D.wallet.availability();
    if(!av||(!av.apple&&!av.google))return D.toast(tr('Demo: qui la tessera si aggiunge ad Apple o Google Wallet.'));
    const which=D.wallet.choose(av,D.wallet.platform());
    if(which)return addToWallet(which);
    const pick=$('#ordPick');
    pick.querySelectorAll('[data-wallet]').forEach(b=>{b.hidden=!av[b.dataset.wallet];b.onclick=()=>addToWallet(b.dataset.wallet)});
    pick.hidden=false;   // both wallets on and we cannot tell the phone: let the customer pick
  };
}

async function run(){
  const id=new URLSearchParams(location.search).get('s')||'';
  for(let i=0;i<MAX_TRIES;i++){
    const o=await D.pay.order(id);
    if(o.error==='bad_session'||o.error==='not_found'){set(tr('Ordine non trovato.'),tr('Il link non è valido. Se hai pagato, controlla l’email di conferma di Stripe o scrivici su WhatsApp.'));return}
    if(o.error){
      if(i===MAX_TRIES-1){set(tr('Non riesco a controllare il pagamento.'),tr('Se hai pagato, Stripe ti ha mandato la ricevuta via email. Scrivici su WhatsApp e verifichiamo subito.'))}
      else await new Promise(r=>setTimeout(r,RETRY_MS));
      continue;
    }
    if(show(o))return;
    await new Promise(r=>setTimeout(r,RETRY_MS));
  }
}
run();
})();
