/* Darta order page: where Stripe sends the customer back to (/ordine?s=cs_...).
   Asks the server whether the session is paid, shows the summary and empties the cart only after a real payment. */
(()=>{
'use strict';
const D=window.DARTA,{$,el,eur}=D;
const box=$('#ordBox');
if(!box)return;
const WA='393939031656';
const RETRY_MS=3500,MAX_TRIES=4;   // a delayed payment method (bank transfer, voucher) can take a moment to show up

const set=(title,text,{no='',items=[],link=''}={})=>{
  $('#ordTitle').textContent=title;
  $('#ordTxt').textContent=text;
  const n=$('#ordNo');n.textContent=no;n.hidden=!no;
  $('#ordList').replaceChildren(...items.map(i=>el('li',{text:`${i.q}x ${i.name}`})));
  const wa=$('#ordWa');wa.href=`https://wa.me/${WA}${no?'?text='+encodeURIComponent('Ordine '+no):''}`;
  const retry=$('#ordRetry');retry.href=link||'/shop#carrello';retry.hidden=!link;
};

function show(o){
  if(o.paid){
    D.store.clear();   // the customer has paid: the cart is done
    const ship=o.mode==='ship';
    set('Grazie, ordine pagato.',
      ship?`Il salone prepara il pacco e ti scrive con il tracking. Totale ${eur(o.total)}. Controlla l’email: Stripe invia la ricevuta del pagamento.`
          :`Lo ritiri in salone, Via Gobetti 184, da martedì a sabato dalle 10:00 alle 19:00: ti scriviamo quando è pronto. Totale ${eur(o.total)}. Controlla l’email: Stripe invia la ricevuta del pagamento.`,
      {no:o.orderNo,items:o.items});
    return true;
  }
  if(o.pending){
    set('Pagamento in elaborazione.','Il tuo metodo di pagamento sta confermando l’importo. Appena arriva ti scriviamo, non serve fare altro.',{no:o.orderNo,items:o.items});
    return false;
  }
  set('Pagamento non completato.','Non è stato addebitato nulla. Il carrello è ancora lì: puoi riprovare quando vuoi.',{link:'/shop#carrello'});
  return true;
}

async function run(){
  const id=new URLSearchParams(location.search).get('s')||'';
  for(let i=0;i<MAX_TRIES;i++){
    const o=await D.pay.order(id);
    if(o.error==='bad_session'||o.error==='not_found'){set('Ordine non trovato.','Il link non è valido. Se hai pagato, controlla l’email di conferma di Stripe o scrivici su WhatsApp.');return}
    if(o.error){
      if(i===MAX_TRIES-1){set('Non riesco a controllare il pagamento.','Se hai pagato, Stripe ti ha mandato la ricevuta via email. Scrivici su WhatsApp e verifichiamo subito.')}
      else await new Promise(r=>setTimeout(r,RETRY_MS));
      continue;
    }
    if(show(o))return;
    await new Promise(r=>setTimeout(r,RETRY_MS));
  }
}
run();
})();
