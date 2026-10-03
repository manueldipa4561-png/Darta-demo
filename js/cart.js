/* Darta cart: header/dock counters, cart drawer, demo checkout, fly-to-cart motion. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur,icon}=D,S=D.store;
const WA='393939031656';           // salon number already published on the site
let lastCoupon=null,justOrdered=false;   // justOrdered: Back after an order must not land on an empty cart

/* ---------- counters ---------- */
function bump(){
  const A=D.A;if(!A||D.reduce())return;
  const badges=$$('.cart-count:not([hidden])'),targets=$$('[data-cart-target]');
  if(badges.length)A.animate(badges,{scale:[1.7,1],duration:700,ease:A.spring({bounce:.55,duration:600})});
  if(targets.length)A.animate(targets,{rotate:[-10,0],duration:520,ease:'outElastic(1,.5)'});
}
function fly(from,btn,url){
  if(D.reduce()||!D.A)return bump();
  const host=document.querySelector('dialog[open]')||document.body;
  const target=host.querySelector('[data-cart-target]')||$('#hdrCart');
  if(!target||!target.getClientRects().length)return bump();
  const r=(btn||from).getBoundingClientRect(),t=target.getBoundingClientRect();
  const img=url||(from&&from.tagName==='IMG'&&from.src)||'';
  const f=el('div',{class:'fly','aria-hidden':'true'});
  f.style.cssText=`left:${r.left+r.width/2-30}px;top:${r.top+r.height/2-30}px`;
  if(img)f.style.backgroundImage=`url("${img}")`;
  host.append(f);
  const dx=t.left+t.width/2-(r.left+r.width/2),dy=t.top+t.height/2-(r.top+r.height/2);
  D.A.animate(f,{x:{to:dx,ease:'inOutSine'},y:{to:dy,ease:'inBack(1.4)'},scale:[1,.28],opacity:[1,.35],duration:760,
    onComplete:()=>{f.remove();bump()}});
}

/* ---------- drawer ---------- */
function thumb(p){return el('img',{src:D.url.thumb(p),alt:'',width:72,height:72})}
function lineEl(x){
  const {l,p,unit}=x,k=l.k,name=S.lineLabel(p,l.v);
  return el('li',{class:'line','data-k':k},
    el('a',{class:'line-img',href:D.url.product(p),'aria-hidden':'true',tabindex:'-1'},thumb(p)),
    el('div',{class:'line-main'},
      el('b',{},el('a',{href:D.url.product(p),text:name})),
      el('span',{text:p.recurring?'Abbonamento mensile':p.tag+' · '+p.size}),
      el('div',{class:'qty','role':'group','aria-label':`Quantità ${name}`},
        el('button',{type:'button','data-act':'dec','aria-label':`Meno ${name}`},icon('s-minus')),
        el('output',{class:'num','aria-live':'polite',text:l.q}),
        el('button',{type:'button','data-act':'inc','aria-label':`Più ${name}`,disabled:l.q>=9},icon('s-plus')))),
    el('div',{class:'line-end'},el('span',{class:'num',text:eur(unit*l.q)}),el('button',{type:'button',class:'rm','data-act':'rm','aria-label':`Rimuovi ${name}`,text:'Rimuovi'})));
}
function render(){
  const t=S.totals();
  $$('.cart-count').forEach(n=>{n.textContent=t.count;n.hidden=!t.count});
  $$('[data-cart-label]').forEach(a=>a.setAttribute('aria-label',t.count?`Carrello, ${t.count} ${t.count===1?'articolo':'articoli'}`:'Carrello vuoto'));
  const empty=!t.count;
  $('#cartEmpty').hidden=!empty;$('#cartBody').hidden=empty;
  $('#cartN').textContent=t.count?`(${t.count})`:'';
  if(empty)return;
  const ul=$('#lines');ul.replaceChildren(...t.items.map(lineEl));
  // delivery
  $('#modeBox').hidden=!t.hasPhysical;
  $$('input[name=mode]').forEach(r=>r.checked=r.value===S.mode);
  const ship=$('#shipTxt'),fill=$('#shipFill'),bar=$('#shipBar');
  if(t.digitalOnly){ship.textContent='Consegna digitale: ricevi tutto via email.';bar.hidden=true}
  else if(!t.ship){ship.textContent='Ritiro gratuito in salone, Via Gobetti 184.';bar.hidden=true}
  else{
    bar.hidden=false;
    ship.textContent=t.freeLeft>0?`Ti mancano ${eur(t.freeLeft)} per la spedizione gratuita.`:'Spedizione gratuita sbloccata.';
    fill.style.transform=`scaleX(${D.cl(1-t.freeLeft/t.freeFrom,.04,1)})`;
    bar.classList.toggle('full',t.freeLeft===0);
  }
  // promo + sums
  if(S.coupon!==lastCoupon){$('#promoIn').value=S.coupon;lastCoupon=S.coupon}
  const pm=$('#promoMsg');
  if(!pm.classList.contains('bad')){
    if(S.coupon){pm.textContent=t.couponLabel+' applicato.';pm.className='promo-msg ok'}
    else{pm.textContent='';pm.className='promo-msg'}
  }
  $('#sumSub').textContent=eur(t.subtotal);
  $('#rowDisc').hidden=!t.discount;$('#sumDisc').textContent='−'+eur(t.discount);
  $('#sumShip').textContent=t.ship?(t.shipping?eur(t.shipping):'Gratis'):(t.digitalOnly?'Digitale':'Ritiro gratis');
  $('#sumTot').textContent=eur(t.total);
}

function openCart(){
  const dlg=$('#cart');
  if(D.cancelClose(dlg)){render();return}                          // reopened during its exit animation
  if(dlg.open)return;
  if(justOrdered&&D.router.nav&&!S.lines.length){D.router.reset();return}   // Back after an order
  dlg.showModal();D.lock(true);render();
  if(D.A&&!D.reduce()&&S.lines.length)D.A.animate('#lines .line',{opacity:[0,1],x:[28,0],duration:560,delay:D.A.stagger(60,{start:120}),ease:'outExpo'});
}
function closeCart(){D.closeDialog($('#cart'))}
function bindCart(){
  D.dialogEvents($('#cart'));
  $('#cartClose').addEventListener('click',()=>D.router.back());
  $('#cartShop').addEventListener('click',()=>{location.href='/shop'});
  $('#lines').addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const k=b.closest('.line').dataset.k,l=S.lines.find(x=>x.k===k);if(!l)return;
    const act=b.dataset.act;
    if(act==='rm')S.remove(k);else S.setQty(k,l.q+(act==='inc'?1:-1));
    render();
    let nb=$(`#lines .line[data-k="${k}"] button[data-act="${act}"]`);
    if(nb&&nb.disabled)nb=$(`#lines .line[data-k="${k}"] button[data-act="dec"]`);   // '+' disables at 9: keep focus in the stepper
    (nb||(S.lines.length?$('#lines button'):$('#cartShop'))).focus();
  });
  $$('input[name=mode]').forEach(r=>r.addEventListener('change',()=>{S.setMode(r.value);render()}));
  $('#promoForm').addEventListener('submit',e=>{
    e.preventDefault();
    const pm=$('#promoMsg'),v=$('#promoIn').value;
    const res=S.applyCoupon(v);
    if(!res.ok){pm.textContent='Codice non valido.';pm.className='promo-msg bad'}
    else{pm.className='promo-msg'}
    render();
    if(res.ok&&!S.coupon){pm.textContent='';pm.className='promo-msg'}
    if(res.ok&&res.code&&D.A&&!D.reduce())D.A.animate('#sumDisc',{scale:[1.25,1],duration:600,ease:'outElastic(1,.6)'});
  });
  $('#promoIn').addEventListener('input',()=>{const pm=$('#promoMsg');if(pm.classList.contains('bad')){pm.textContent='';pm.className='promo-msg';render()}});
  $('#goCheckout').addEventListener('click',()=>D.router.go('#checkout'));
  D.router.reg('carrello',{isOpen:()=>$('#cart').open,open:openCart,close:closeCart});
}

/* ---------- checkout ---------- */
const nextOpen=()=>{
  const names=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  const w=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short'}).format(new Date());
  let d=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(w);
  do{d=(d+1)%7}while(d<2);
  return names[d];
};
const orderNo=()=>{
  const b=new Uint8Array(4);(crypto.getRandomValues?crypto.getRandomValues(b):b.forEach((_,i)=>b[i]=Math.random()*256));
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ';
  return 'DA-'+(1000+((b[0]<<8|b[1])%9000))+A[b[2]%A.length]+A[b[3]%A.length];
};
const RULES={
  coName:v=>v.trim().length>=2?'':'Inserisci il tuo nome.',
  coEmail:v=>v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())?'':'Inserisci un’email valida.',
  coPhone:v=>!v.trim()||/^[+\d][\d\s().-]{6,}$/.test(v.trim())?'':'Controlla il numero di telefono.',
  coAddr:v=>v.trim().length>=5?'':'Inserisci via e numero civico.',
  coCap:v=>/^\d{5}$/.test(v.trim())?'':'Il CAP ha 5 cifre.',
  coCity:v=>v.trim().length>=2?'':'Inserisci la città.'
};
function showErr(id,msg){
  const i=$('#'+id),e=$('#err-'+id);
  i.setAttribute('aria-invalid',msg?'true':'false');
  if(msg)i.setAttribute('aria-describedby','err-'+id);else i.removeAttribute('aria-describedby');
  e.textContent=msg;e.hidden=!msg;
}
function fillCheckout(){
  const t=S.totals();
  $('#coForm').hidden=false;$('#coDone').hidden=true;$('#coTitle').hidden=false;
  $('#coShip').hidden=!t.ship;
  $('#coModeTxt').textContent=t.digitalOnly?'Consegna digitale via email':t.ship?'Spedizione a domicilio':'Ritiro gratuito in salone, Via Gobetti 184';
  $('#coModeEdit').hidden=!t.hasPhysical;
  $('#coSum').replaceChildren(...t.items.map(x=>el('li',{},el('span',{text:`${x.l.q} × ${S.lineLabel(x.p,x.l.v)}`}),el('span',{class:'num',text:eur(x.unit*x.l.q)}))));
  $('#coRows').replaceChildren(
    ...(t.discount?[el('div',{},el('dt',{text:'Sconto'}),el('dd',{class:'num',text:'−'+eur(t.discount)}))]:[]),
    ...(t.ship?[el('div',{},el('dt',{text:'Spedizione'}),el('dd',{class:'num',text:t.shipping?eur(t.shipping):'Gratis'}))]:[]));
  $('#coTot').textContent=eur(t.total);
  $('#coSubmitTxt').textContent=`Conferma ordine · ${eur(t.total)}`;
  ['coName','coEmail','coPhone','coAddr','coCap','coCity'].forEach(id=>showErr(id,''));
}
function openCheckout(){
  if(!S.lines.length){D.router.go('#carrello');return}
  const dlg=$('#checkout');
  if(D.cancelClose(dlg))return;
  if(dlg.open)return;
  fillCheckout();dlg.showModal();D.lock(true);dlg.scrollTop=0;
  if(D.A&&!D.reduce())D.A.animate('#coForm > *',{opacity:[0,1],y:[16,0],duration:560,delay:D.A.stagger(50,{start:100}),ease:'outExpo'});
}
function closeCheckout(){D.closeDialog($('#checkout'))}
function submitOrder(e){
  e.preventDefault();
  const t=S.totals();if(!t.count)return;
  const ids=['coName','coEmail','coPhone'].concat(t.ship?['coAddr','coCap','coCity']:[]);
  let first=null;
  ids.forEach(id=>{const m=RULES[id]($('#'+id).value);showErr(id,m);if(m&&!first)first=id});
  if(first){$('#'+first).focus();return}
  const no=orderNo(),when=t.digitalOnly?'':nextOpen();
  const lines=t.items.map(x=>`${x.l.q}x ${S.lineLabel(x.p,x.l.v)}`);
  $('#doneNo').textContent=no;
  $('#doneTxt').textContent=t.digitalOnly?'Ti inviamo gli acquisti via email appena confermati dal salone.'
    :t.ship?`Il salone prepara il pacco e ti scrive con il tracking. Totale ${eur(t.total)}.`
    :`Il tuo ordine è pronto per il ritiro da ${when}, dalle 10:00 alle 19:00. Totale ${eur(t.total)}.`;
  $('#doneList').replaceChildren(...lines.map(l=>el('li',{text:l})));
  const msg=`[DEMO Punto Due Studio] Ordine ${no}: ${lines.join(', ')}. Totale ${eur(t.total)}. ${t.ship?'Spedizione':t.digitalOnly?'Consegna digitale':'Ritiro in salone'}.`;
  $('#doneWa').href=`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  $('#coForm').reset();$('#coForm').hidden=true;$('#coDone').hidden=false;$('#coTitle').hidden=true;$('#checkout').scrollTop=0;
  justOrdered=true;S.clear();
  celebrate();
  $('#doneTitle').focus();
}
function celebrate(){
  const A=D.A;if(!A||D.reduce())return;
  const box=$('#doneBurst');box.replaceChildren();
  const dots=Array.from({length:18},(_,i)=>{const d=el('i');box.append(d);return d});
  A.animate('#doneCheck path',{strokeDashoffset:[1,0],duration:760,delay:180,ease:'outCubic'});
  A.animate('#doneCheck circle',{strokeDashoffset:[1,0],duration:900,ease:'inOutQuad'});
  A.animate(dots,{x:()=>A.utils.random(-130,130),y:()=>A.utils.random(-120,110),scale:[0,()=>A.utils.random(.5,1.4)],opacity:[1,0],duration:1100,delay:A.stagger(18,{start:260}),ease:'outExpo'});
  A.animate('#doneNo',{scale:[.8,1],opacity:[0,1],duration:700,delay:480,ease:'outElastic(1,.6)'});
  A.animate('#coDone .done-in > *:not(.done-art)',{opacity:[0,1],y:[14,0],duration:560,delay:A.stagger(60,{start:420}),ease:'outExpo'});
}
function bindCheckout(){
  D.dialogEvents($('#checkout'));
  $('#coClose').addEventListener('click',()=>D.router.back());
  $('#coModeEdit').addEventListener('click',()=>D.router.back());
  $('#coForm').addEventListener('submit',submitOrder);
  Object.keys(RULES).forEach(id=>$('#'+id).addEventListener('blur',()=>{const i=$('#'+id);if(!i.closest('[hidden]')&&(i.value||i.getAttribute('aria-invalid')==='true'))showErr(id,RULES[id](i.value))}));
  $('#doneClose').addEventListener('click',()=>D.router.reset());
  D.router.reg('checkout',{isOpen:()=>$('#checkout').open,open:openCheckout,close:closeCheckout});
}

D.cart={
  init(){bindCart();bindCheckout();S.on(()=>{if(S.lines.length)justOrdered=false;render()});render()},
  fly,bump,render
};
})();
