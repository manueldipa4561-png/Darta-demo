/* Darta main: page wiring (reveals, booking sheet, opening status) and shop bootstrap. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$}=D;

/* reveal on enter */
$$('.rv').forEach(D.reveal);

/* club names fill as they cross the middle of the screen */
const clubIO=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('lit',e.isIntersecting)),{rootMargin:'-40% 0px -40% 0px'});
$$('#clubs li').forEach(li=>clubIO.observe(li));

/* booking sheet */
(()=>{
  const sheet=$('#sheet');
  if(/Android/.test(navigator.userAgent)){const a=$('[data-os=android]'),i=$('[data-os=ios]');a.className='btn btn-p';i.className='btn btn-g';i.before(a)}
  const defTxt=$('#shTxt').textContent;
  $$('[data-book]').forEach(b=>b.addEventListener('click',()=>{
    const who=b.dataset.who,t=$('#shTxt');
    t.textContent=who?"Nell'app scegli il servizio, poi ":defTxt;
    if(who){const w=document.createElement('b');w.textContent=who;t.append(w," come barber e l'orario che preferisci.")}
    sheet.showModal();D.lock(true);
  }));
  $('#shClose').onclick=()=>sheet.close();
  sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close()});
  sheet.addEventListener('close',()=>D.lock(false));
})();

/* live opening status, Europe/Rome */
(()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  const d=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),m=(+p.hour%24)*60+(+p.minute);
  const openDay=d>=2&&d<=6,open=openDay&&m>=600&&m<1140,st=$('#status');
  st.classList.toggle('open',open);
  st.lastElementChild.textContent=open?'Aperto ora, chiude alle 19:00':(openDay&&m<600)?'Chiuso, apre oggi alle 10:00':`Chiuso, riapre ${d===6||d===0?'martedì':'domani'} alle 10:00`;
  const li=$(`#hours li[data-d="${d}"]`);li&&li.classList.add('today');
  // the header chip mirrors it
  const chip=$('#hdrOpen');if(chip){chip.classList.toggle('open',open);chip.lastElementChild.textContent=open?'Aperto':'Chiuso'}
})();

/* motion layer */
D.motion&&D.motion.init();

/* shop: catalog -> shelf, cart, deep links */
D.store.load().then(()=>{
  D.shop.init();D.cart.init();D.film&&D.film.init();
  D.router.sync();
}).catch(err=>{
  console.warn('Darta shop unavailable',err);
  $('#shop').hidden=true;if($('#film'))$('#film').hidden=true;$$('[data-cart-label]').forEach(a=>a.hidden=true);
  $$('a[href="#shop"]').forEach(a=>a.hidden=true);
});
})();
