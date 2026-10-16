/* Darta product page: the product's own film ("Guarda come si usa"), options, quantity, add to cart.
   Text, price and the photo are already in the HTML (tools/build-pages.py), so the page works without script. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur}=D,S=D.store,tr=D.t;
const root=$('main.pp');
if(!root)return;
const stage=$('#ppStage');
let p=null,qty=1,vid='';

const defVid=q=>q.variants?(q.variants[1]||q.variants[0]).id:'';
const unit=()=>S.unit(p,vid);

function syncBuy(){
  $('#ppPrice').textContent=p.recurring?tr('{price} /mese',{price:eur(unit())}):eur(unit());
  $('#ppQ').textContent=qty;
  $('#ppAddTxt').replaceChildren(tr('Aggiungi'),el('span',{class:'opt',text:' '+tr('al carrello')}),` · ${eur(unit()*qty)}`);
  $('#ppMinus').disabled=qty<=1;$('#ppPlus').disabled=qty>=9;
}

/* captions that follow the film: one step lights up at a time ([from, to, caption] as shares of the film's length, timed on each film) */
const STEPS={
  powder:[[0,.45,'Svita'],[.45,.76,'Scuoti'],[.76,1,'Dai volume']],
  can:[[0,.40,'Apri'],[.40,.62,'Spruzza'],[.62,1,'Richiudi']],
  oil:[[0,.36,'Apri'],[.36,.62,'Premi'],[.62,1,'Richiudi']],
  pump:[[0,.50,'Premi'],[.50,1,'Ancora una volta']],
  tube:[[0,.62,'Svita'],[.62,.88,'Spremi'],[.88,1,'Richiudi']],
  tin:[[0,.45,'Svita'],[.45,.72,'Prendi una noce'],[.72,1,'Richiudi']]
};
const ROUTINE={tin:'tin',powder:'powder',oilbottle:'oil',can:'can',tube:'tube',pumpbottle:'pump'};   // catalog kind -> steps

/* "Guarda come si usa": the product goes through its own routine in the stage (img/use/<slug>.mp4, made with Higgsfield from the
   packshot, no hands). The film starts and ends on the packshot, so it fades in over the photo and back out without a jump.
   Nothing is downloaded before the tap. */
function useFilm(){
  const src=stage.dataset.use;
  if(!src)return;
  const list=STEPS[ROUTINE[p.kind]]||[];
  const v=el('video',{class:'pdp-use',playsinline:true,preload:'none',tabindex:'-1','aria-hidden':'true'});v.muted=true;
  const ol=el('ol',{class:'pdp-steps','aria-hidden':'true'},list.map(([,,txt],i)=>el('li',null,el('b',{text:String(i+1).padStart(2,'0')}),tr(txt))));
  const b=el('button',{type:'button',class:'pdp-start'},el('span',{class:'pdp-start-ico','aria-hidden':'true'}),tr('Guarda come si usa'));
  let raf=0,cur=-2;
  const light=i=>{if(i!==cur){cur=i;[...ol.children].forEach((li,j)=>li.classList.toggle('on',j===i))}};
  const tick=()=>{const t=v.duration?v.currentTime/v.duration:0;light(list.findIndex(([a,c])=>t>=a&&t<c));raf=requestAnimationFrame(tick)};
  const stop=()=>{cancelAnimationFrame(raf);stage.classList.remove('playing');light(-1);b.disabled=false};
  b.addEventListener('click',()=>{
    if(!v.src)v.src=src;
    b.disabled=true;v.currentTime=0;
    v.play().then(()=>{stage.classList.add('playing');raf=requestAnimationFrame(tick)}).catch(stop);
  });
  v.addEventListener('ended',stop);
  stage.append(v,ol,b);
}

/* the real product on the studio shelf (img/spot/*.mp4): plays while it is on screen; phones wait for a tap, reduced motion gets plain controls */
function spot(){
  const v=$('#ppSpot');if(!v)return;
  const start=()=>{if(!v.src)v.src=v.dataset.src;v.play().catch(()=>{})};
  if(D.reduce()){v.src=v.dataset.src;v.controls=true;return}
  let armed=!D.lite();
  if(!armed){
    const b=el('button',{type:'button',class:'pp-spot-play','aria-label':tr('Guarda il video')});
    b.addEventListener('click',()=>{armed=true;b.remove();start()});v.after(b);
  }
  new IntersectionObserver(([e])=>{if(!armed)return;if(e.isIntersecting)start();else v.pause()},{threshold:.35}).observe(v);
}

function bind(){
  $$('input[name=pv]').forEach(r=>r.addEventListener('change',()=>{vid=r.value;syncBuy()}));
  $('#ppMinus').addEventListener('click',()=>{qty=Math.max(1,qty-1);syncBuy()});
  $('#ppPlus').addEventListener('click',()=>{qty=Math.min(9,qty+1);syncBuy()});
  $('#ppAdd').addEventListener('click',()=>{
    S.add(p.id,vid,qty);
    D.cart.fly(stage,$('#ppAdd'),$('#ppFallback').src);
    const add=$('#ppAdd');$('#ppAddTxt').textContent=tr('Aggiunto');add.classList.add('done');
    setTimeout(()=>{add.classList.remove('done');syncBuy()},1300);
    D.toast(tr('{name} nel carrello',{name:S.lineLabel(p,vid)}),{label:tr('Apri'),fn:()=>D.router.go(D.hash.cart)});
  });
}

D.product={
  init(){
    p=S.bySlug[root.dataset.slug];
    if(!p)return;
    vid=defVid(p);
    const checked=$('input[name=pv]:checked');if(checked)vid=checked.value;
    bind();syncBuy();spot();useFilm();
  }
};
})();
