/* Darta product page: live 3D viewer (drag, arrows, "Svita e scuoti" / "Apri"), options, quantity, add to cart.
   Text, price and a still picture are already in the HTML (tools/build-pages.py), so the page works without script or WebGL. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur}=D,S=D.store,tr=D.t;
const root=$('main.pp');
if(!root)return;
const GL=D.GL,stage=$('#ppStage'),host=$('#ppHost');
let p=null,qty=1,vid='';

const defVid=q=>q.variants?(q.variants[1]||q.variants[0]).id:'';
const unit=()=>S.unit(p,vid);

function syncBuy(){
  $('#ppPrice').textContent=p.recurring?tr('{price} /mese',{price:eur(unit())}):eur(unit());
  $('#ppQ').textContent=qty;
  $('#ppAddTxt').replaceChildren(tr('Aggiungi'),el('span',{class:'opt',text:' '+tr('al carrello')}),` · ${eur(unit()*qty)}`);
  $('#ppMinus').disabled=qty<=1;$('#ppPlus').disabled=qty>=9;
}

/* captions that follow the animation: one step lights up at a time ([from, to, caption] on the animation's own 0..1 timeline) */
const STEPS={
  powder:[[0,.34,'Svita'],[.34,.82,'Scuoti'],[.82,1,'Dai volume']],
  can:[[0,.36,'Apri'],[.36,.72,'Spruzza'],[.72,1,'Richiudi']],
  oil:[[0,.40,'Apri'],[.40,.66,'Premi'],[.66,1,'Richiudi']],
  pump:[[0,.38,'Premi'],[.38,1,'Ancora una volta']],
  tube:[[0,.30,'Capovolgi'],[.30,.50,'Svita'],[.50,.80,'Spremi'],[.80,1,'Richiudi']],
  tin:[[0,.45,'Svita'],[.45,.72,'Prendi una noce'],[.72,1,'Richiudi']]
};
function setSteps(v){
  const old=$('#ppSteps');if(old)old.remove();
  const list=STEPS[GL.specFor(p).pose||p.kind];
  if(!list){v.onTick=null;return}
  const ol=el('ol',{class:'pdp-steps',id:'ppSteps','aria-hidden':'true'},list.map(([,,txt],i)=>el('li',null,el('b',{text:String(i+1).padStart(2,'0')}),tr(txt))));
  stage.appendChild(ol);
  let cur=-2;
  v.onTick=t=>{const i=list.findIndex(([a,b])=>t>=a&&t<b);if(i!==cur){cur=i;[...ol.children].forEach((li,j)=>li.classList.toggle('on',j===i))}};
}

/* the product's own animation (same timeline as the scroll scenes) */
function setTry(){
  const b=$('#ppTry'),v=GL.viewer;
  if(!b)return;
  const can=v.canPlay()&&!D.reduce();
  b.hidden=!can;b.classList.remove('playing');b.disabled=false;
  if(!can)return;
  const TRY={powder:['Svita e scuoti','Scuoti...'],tube:['Capovolgi','Capovolgo...'],pumpbottle:['Premi','Premo...']},[tryLabel,tryBusy]=TRY[p.kind]||['Apri','Apri...'],label=tr(tryLabel);
  $('#ppTryTxt').textContent=label;
  setSteps(v);
  v.onPlay=on=>{b.classList.toggle('playing',on);stage.classList.toggle('playing',on);b.disabled=on;$('#ppTryTxt').textContent=on?tr(tryBusy):label};
}

async function mountViewer(){
  if(!GL.supported())return;                              // the still picture stays
  await GL.fontsReady();
  GL.setCatalog(S.catalog.products);
  const ok=await GL.viewer.start(host,p,{amount:+vid||0});
  if(ok){stage.classList.add('live');stage.classList.toggle('still',D.reduce());setTry()}
}

/* phones: the picture stays a picture until the visitor taps it (no WebGL, no textures, no battery spent); then the 3D viewer starts and plays the animation */
function armStage(){
  const b=el('button',{type:'button',class:'pdp-start'},el('span',{class:'pdp-start-ico','aria-hidden':'true'}),tr('Guarda in 3D'));
  b.addEventListener('click',async()=>{b.disabled=true;await mountViewer();b.remove();if(stage.classList.contains('live'))GL.viewer.play()});
  stage.appendChild(b);
}

function bind(){
  $$('input[name=pv]').forEach(r=>r.addEventListener('change',()=>{vid=r.value;syncBuy();GL.viewer.setAmount(+vid||0)}));
  $('#ppMinus').addEventListener('click',()=>{qty=Math.max(1,qty-1);syncBuy()});
  $('#ppPlus').addEventListener('click',()=>{qty=Math.min(9,qty+1);syncBuy()});
  $('#ppL').addEventListener('click',()=>GL.viewer.nudge(-.6));
  $('#ppR').addEventListener('click',()=>GL.viewer.nudge(.6));
  const tryBtn=$('#ppTry');
  if(tryBtn)tryBtn.addEventListener('click',()=>GL.viewer.play());
  $('#ppAdd').addEventListener('click',()=>{
    S.add(p.id,vid,qty);
    D.cart.fly(stage,$('#ppAdd'),$('#ppFallback').src);
    const add=$('#ppAdd');$('#ppAddTxt').textContent=tr('Aggiunto');add.classList.add('done');
    setTimeout(()=>{add.classList.remove('done');syncBuy()},1300);
    D.toast(tr('{name} nel carrello',{name:S.lineLabel(p,vid)}),{label:tr('Apri'),fn:()=>D.router.go(D.hash.cart)});
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
    bind();syncBuy();
    if(D.lite()&&!D.reduce()&&GL.supported())armStage();else mountViewer();
  }
};
})();
