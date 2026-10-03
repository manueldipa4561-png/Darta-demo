/* Darta main: page wiring (reveals, booking sheet, opening status) and shop bootstrap. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$}=D,tr=D.t;

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
    const who=b.dataset.who,service=b.dataset.service,t=$('#shTxt');
    const named=(sentence,name)=>{const [a,c]=sentence.split('{b}'),b=document.createElement('b');b.textContent=name;t.replaceChildren(a,b,c)};   // the name goes in bold, wherever the language puts it
    if(who)named(tr("Nell'app scegli il servizio, poi {b} come barber e l'orario che preferisci."),who);
    else if(service)named(tr("Nell'app scegli {b} e il barber con l'orario che preferisci."),service);
    else t.textContent=defTxt;
    sheet.showModal();D.lock(true);
  }));
  $('#shClose').onclick=()=>sheet.close();
  sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close()});
  sheet.addEventListener('close',()=>D.lock(false));
})();

/* live opening status, Europe/Rome: header chip (red closed / green open) and the hours block, kept current without a reload */
(()=>{
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],OPEN=10*60,CLOSE=19*60;   // open Tuesday to Saturday, 10:00 to 19:00
  let shownDay=-1;
  function update(now=new Date()){
    const p=Object.fromEntries(fmt.formatToParts(now).map(x=>[x.type,x.value]));
    const d=DAYS.indexOf(p.weekday),m=(+p.hour%24)*60+(+p.minute);
    const openDay=d>=2&&d<=6,open=openDay&&m>=OPEN&&m<CLOSE;
    const txt=open?tr('Aperto ora, chiude alle 19:00'):(openDay&&m<OPEN)?tr('Chiuso, apre oggi alle 10:00'):(d===6||d===0)?tr('Chiuso, riapre martedì alle 10:00'):tr('Chiuso, riapre domani alle 10:00');
    const st=$('#status'),chip=$('#hdrOpen');
    if(st){st.classList.toggle('open',open);st.lastElementChild.textContent=txt}
    if(chip){chip.classList.toggle('open',open);chip.lastElementChild.textContent=open?tr('Aperto'):tr('Chiuso');chip.title=txt}
    if(d!==shownDay){                                   // new day: move the "oggi" marker in the hours list
      $$('#hours li.today').forEach(li=>li.classList.remove('today'));
      const li=$(`#hours li[data-d="${d}"]`);li&&li.classList.add('today');shownDay=d;
    }
  }
  update();
  setInterval(update,20000);                              // flips at 10:00 and 19:00 by itself
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});   // timers sleep in background tabs: catch up on return
  addEventListener('pageshow',()=>update());
  D.openStatus=update;                                    // update(date) lets tests check any moment
})();

/* motion layer */
D.motion&&D.motion.init();

/* catalog: shop page behaviours, product page, cart, and the home shop intro, whichever of them this page has */
D.store.load().then(()=>{
  D.shop&&D.shop.init();D.product&&D.product.init();D.cart.init();D.shopIntro&&D.shopIntro.init();
  D.router.sync();
}).catch(err=>{
  console.warn('Darta shop unavailable',err);
  $$('[data-cart-label]').forEach(a=>a.hidden=true);
  const add=$('#ppAdd');if(add)add.disabled=true;
  $$('.pcard-add').forEach(b=>{b.hidden=true});
});
})();
