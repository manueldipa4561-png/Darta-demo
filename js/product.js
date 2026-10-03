/* Darta product page: live 3D viewer (drag, arrows, "Svita e scuoti" / "Apri"), options, quantity, add to cart.
   Text, price and a still picture are already in the HTML (tools/build-pages.py), so the page works without script or WebGL. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur}=D,S=D.store;
const root=$('main.pp');
if(!root)return;
const GL=D.GL,stage=$('#ppStage'),host=$('#ppHost');
let p=null,qty=1,vid='';

const defVid=q=>q.variants?(q.variants[1]||q.variants[0]).id:'';
const unit=()=>S.unit(p,vid);

function syncBuy(){
  $('#ppPrice').textContent=eur(unit())+(p.recurring?' /mese':'');
  $('#ppQ').textContent=qty;
  $('#ppAddTxt').replaceChildren('Aggiungi',el('span',{class:'opt',text:' al carrello'}),` · ${eur(unit()*qty)}`);
  $('#ppMinus').disabled=qty<=1;$('#ppPlus').disabled=qty>=9;
}

/* the product's own animation (same timeline as the scroll scenes) */
function setTry(){
  const b=$('#ppTry'),v=GL.viewer;
  if(!b)return;
  const can=v.canPlay()&&!D.reduce();
  b.hidden=!can;b.classList.remove('playing');b.disabled=false;
  if(!can)return;
  const label=p.kind==='powder'?'Svita e scuoti':'Apri';
  $('#ppTryTxt').textContent=label;
  v.onPlay=on=>{b.classList.toggle('playing',on);b.disabled=on;if(!on)$('#ppTryTxt').textContent=label};
}

async function mountViewer(){
  if(!GL.supported())return;                              // the still picture stays
  await GL.fontsReady();
  GL.setCatalog(S.catalog.products);
  const ok=await GL.viewer.start(host,p,{amount:+vid||0});
  if(ok){stage.classList.add('live');stage.classList.toggle('still',D.reduce());setTry()}
}

function bind(){
  $$('input[name=pv]').forEach(r=>r.addEventListener('change',()=>{vid=r.value;syncBuy();GL.viewer.setAmount(+vid||0)}));
  $('#ppMinus').addEventListener('click',()=>{qty=Math.max(1,qty-1);syncBuy()});
  $('#ppPlus').addEventListener('click',()=>{qty=Math.min(9,qty+1);syncBuy()});
  $('#ppL').addEventListener('click',()=>GL.viewer.nudge(-.6));
  $('#ppR').addEventListener('click',()=>GL.viewer.nudge(.6));
  const tryBtn=$('#ppTry');
  if(tryBtn)tryBtn.addEventListener('click',()=>{if(GL.viewer.play())$('#ppTryTxt').textContent=p.kind==='powder'?'Scuoti...':'Apri...'});
  $('#ppAdd').addEventListener('click',()=>{
    S.add(p.id,vid,qty);
    D.cart.fly(stage,$('#ppAdd'),$('#ppFallback').src);
    const add=$('#ppAdd');$('#ppAddTxt').textContent='Aggiunto';add.classList.add('done');
    setTimeout(()=>{add.classList.remove('done');syncBuy()},1300);
    D.toast(`${S.lineLabel(p,vid)} nel carrello`,{label:'Apri',fn:()=>D.router.go('#carrello')});
  });
  D.onGLLost=()=>stage.classList.remove('live');
  D.onGLRestored=()=>mountViewer();
}

D.product={
  init(){
    p=S.bySlug[root.dataset.slug];
    if(!p)return;
    vid=defVid(p);
    const checked=$('input[name=pv]:checked');if(checked)vid=checked.value;
    bind();syncBuy();mountViewer();
  }
};
})();
