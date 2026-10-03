/* Darta shop page: category filters, quick add to cart, the second picture on hover, pointer spotlight.
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

function bindCard(card){
  const media=$('.pcard-media',card),b=$('.pcard-img.b',card),add=$('[data-add]',card);
  if(matchMedia('(hover:hover)').matches){
    // the second picture is only fetched when someone hovers (phones never download it)
    card.addEventListener('pointerenter',()=>{if(b.dataset.src){b.onload=()=>b.classList.add('ready');b.src=b.dataset.src;delete b.dataset.src}},{once:true});
    if(!D.reduce()){
      media.addEventListener('pointermove',e=>{const r=media.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
        media.style.setProperty('--mx',x*100+'%');media.style.setProperty('--my',y*100+'%');media.style.setProperty('--tx',((x-.5)*8).toFixed(2)+'deg');media.style.setProperty('--ty',((.5-y)*8).toFixed(2)+'deg')});
      media.addEventListener('pointerleave',()=>{media.style.removeProperty('--tx');media.style.removeProperty('--ty')});
    }
  }
  if(add)add.addEventListener('click',()=>{
    const p=S.byId[add.dataset.add];if(!p)return;
    S.add(p.id,'',1);D.cart.fly($('.pcard-img.a',card),add);
    D.toast(tr('{name} nel carrello',{name:p.name}),{label:tr('Apri'),fn:()=>D.router.go(D.hash.cart)});
  });
}

D.shop={
  init(){
    if(!$('#shelf'))return;
    $$('.pcard').forEach(bindCard);
    $$('.fbtn').forEach(btn=>btn.addEventListener('click',()=>setFilter(btn.dataset.cat)));
  }
};
})();
