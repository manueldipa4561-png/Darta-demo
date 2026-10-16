/* Darta shop page: category filters, quick add to cart, the product's loop video on hover (on touch screens only after a tap), pointer spotlight.
   The cards themselves are static HTML written by tools/build-pages.py, so the page paints with no script and no 3D. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$}=D,S=D.store,tr=D.t;

function setFilter(cat){
  $$('.fbtn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat===cat)));
  const shown=[];
  $$('.pcard').forEach(c=>{const on=cat==='tutti'||c.dataset.cat===cat;c.hidden=!on;if(on)shown.push(c)});
  $('#shopCount').textContent=shown.length===1?tr('{n} prodotto',{n:1}):tr('{n} prodotti',{n:shown.length});
  if(D.A&&!D.reduce())D.A.animate(shown,{opacity:[0,1],y:[22,0],scale:[.97,1],duration:520,delay:D.A.stagger(55),ease:'outExpo',
    onComplete:()=>shown.forEach(c=>{c.style.removeProperty('transform');c.style.removeProperty('opacity')})});   // leave hover styles in charge
}

/* the loop (img/v/<slug>.mp4, made by tools/encode-loops.py) is only downloaded when it is first played; saving data or reduced motion: never */
const lite=()=>D.reduce()||(navigator.connection&&navigator.connection.saveData);
function loopOf(card){
  const v=$('.pcard-vid',card);
  if(!v||lite())return null;
  let off=0;
  return {
    play(){clearTimeout(off);if(!v.src&&v.dataset.src)v.src=v.dataset.src;v.play().then(()=>card.classList.add('playing')).catch(()=>{})},
    stop(){card.classList.remove('playing');clearTimeout(off);off=setTimeout(()=>{v.pause();v.currentTime=0},500)}   // fade out first, then rewind
  };
}

let active=null;                                                           // the card playing on a touch screen: one at a time
function bindCard(card){
  const media=$('.pcard-media',card),add=$('[data-add]',card),loop=loopOf(card);
  if(loop){
    if(matchMedia('(hover:hover)').matches){
      card.addEventListener('pointerenter',loop.play);card.addEventListener('pointerleave',loop.stop);
      card.addEventListener('focusin',loop.play);card.addEventListener('focusout',loop.stop);
    }else{                                                                 // touch: nothing loads or moves until a tap; the first tap plays, a tap while it plays opens the product
      media.addEventListener('click',e=>{if(!card.classList.contains('playing')){e.preventDefault();if(active&&active!==loop)active.stop();active=loop;loop.play()}});
      new IntersectionObserver(([e])=>{if(!e.isIntersecting)loop.stop()},{threshold:.2}).observe(media);   // off screen: stop (battery)
    }
  }
  if(matchMedia('(hover:hover)').matches&&!D.reduce()){
    media.addEventListener('pointermove',e=>{const r=media.getBoundingClientRect();media.style.setProperty('--mx',((e.clientX-r.left)/r.width*100).toFixed(1)+'%');media.style.setProperty('--my',((e.clientY-r.top)/r.height*100).toFixed(1)+'%')});
  }
  if(add)add.addEventListener('click',()=>{
    const p=S.byId[add.dataset.add];if(!p)return;
    S.add(p.id,'',1);D.cart.fly($('.pcard-img.a',card),add);
    D.toast(tr('{name} nel carrello',{name:p.name}),{label:tr('Apri'),fn:()=>D.router.go(D.hash.cart)});
  });
}

/* the counter film above the shelf (img/spot/banco.mp4, phones get the 480p banco-m.mp4): downloaded and played only while it is on screen;
   reduced motion or saving data keeps the still */
function film(){
  const v=$('#shopFilm');
  if(!v||lite())return;
  new IntersectionObserver(([e])=>{
    if(!e.isIntersecting){v.pause();return}
    if(!v.src)v.src=(innerWidth<760&&v.dataset.srcM)||v.dataset.src;
    v.play().catch(()=>{});
  },{threshold:.25}).observe(v);
}

D.shop={
  init(){
    if(!$('#shelf'))return;
    film();
    $$('.pcard').forEach(bindCard);
    $$('.fbtn').forEach(btn=>btn.addEventListener('click',()=>setFilter(btn.dataset.cat)));
  }
};
})();
