/* Darta shop: shelf, filters, product sheet with the live 3D viewer. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur,icon}=D,S=D.store,GL=D.GL;
const snaps=Object.create(null);   // id -> {a,b} data urls
let started=false,current=null,qty=1,vid='',mountTok=0;

const priceTxt=p=>p.variants?'da '+eur(p.variants[0].price):eur(p.price)+(p.recurring?' /mese':'');
const defVid=p=>p.variants?(p.variants[1]||p.variants[0]).id:'';
const catLabel=id=>(S.catalog.cats.find(c=>c.id===id)||{}).label||id;
const kitSaving=p=>p.items?p.items.reduce((s,i)=>s+S.byId[i].price,0)-p.price:0;
const idle=()=>new Promise(r=>'requestIdleCallback' in window?requestIdleCallback(r,{timeout:240}):setTimeout(r,24));

/* ---------- shelf ---------- */
function fallbackArt(p){ // no WebGL: simple silhouette so cards are never empty
  const paths={jar:'M30 62h60v52H30zM26 50h68v14H26z',dropper:'M54 18h12v26H54zM48 44h24v10H48zM42 54h36v62H42z',spray:'M52 20h24v10H52zM50 30h20v18H50zM40 48h40v68H40z',kit:'M14 74h36v40H14zM58 50h24v64H58zM90 36h20v78H90z',card:'M18 40h84v56H18z'};
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('viewBox','0 0 120 140');s.setAttribute('class','pcard-art');s.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[p.kind]||paths.jar);s.appendChild(path);return s;
}
function card(p,i){
  const quick=!p.variants;
  const a=el('a',{class:'pcard-media',href:'#prodotto/'+p.slug,'data-route':'','aria-label':`${p.name}, ${priceTxt(p)}. Apri scheda prodotto`},
    el('span',{class:'pcard-no'},'/'+p.no),
    el('span',{class:'pcard-glow','aria-hidden':'true'}),
    el('img',{class:'pcard-img a',alt:'',width:560,height:560,decoding:'async'}),
    el('img',{class:'pcard-img b',alt:'',width:560,height:560,decoding:'async'}));
  if(p.items){const sv=kitSaving(p);if(sv>0)a.append(el('span',{class:'pcard-badge',text:'Risparmi '+eur(sv)}))}
  const add=el('button',{class:'pcard-add',type:'button','aria-label':quick?`Aggiungi ${p.name} al carrello`:`Scegli importo ${p.name}`},icon(quick?'s-plus':'s-arrow'));
  add.addEventListener('click',e=>{
    e.stopPropagation();
    if(!quick){D.router.go('#prodotto/'+p.slug);return}
    S.add(p.id,'',1);D.cart.fly(a.querySelector('.pcard-img.a'),add);
    D.toast(`${p.name} nel carrello`,{label:'Apri',fn:()=>D.router.go('#carrello')});
  });
  const art=el('article',{class:'pcard rv'+(p.items?' feature':''),'data-id':p.id,'data-cat':p.cat,style:`--i:${i%4}`},
    a,
    el('div',{class:'pcard-body'},
      el('div',{},el('h3',{class:'pcard-name',text:p.name}),el('p',{class:'pcard-tag',text:p.tag+' · '+p.size})),
      el('div',{class:'pcard-buy'},el('span',{class:'pcard-price num',text:priceTxt(p)}),add)));
  // pointer spotlight + tilt (desktop only)
  if(matchMedia('(hover:hover)').matches&&!D.reduce()){
    a.addEventListener('pointermove',e=>{const r=a.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      a.style.setProperty('--mx',x*100+'%');a.style.setProperty('--my',y*100+'%');a.style.setProperty('--tx',((x-.5)*8).toFixed(2)+'deg');a.style.setProperty('--ty',((.5-y)*8).toFixed(2)+'deg')});
    a.addEventListener('pointerleave',()=>{a.style.removeProperty('--tx');a.style.removeProperty('--ty')});
  }
  return art;
}
function renderShelf(){
  const shelf=$('#shelf'),filters=$('#filters');
  S.catalog.cats.forEach(c=>{
    const b=el('button',{class:'fbtn',type:'button','data-cat':c.id,'aria-pressed':c.id==='tutti'?'true':'false',text:c.label});
    b.addEventListener('click',()=>setFilter(c.id));filters.append(b);
  });
  S.catalog.products.forEach((p,i)=>{const c=card(p,i);shelf.append(c);D.reveal(c)});
  $('#shopCount').textContent=`${S.catalog.products.length} prodotti`;
  injectLD();
}
function setFilter(cat){
  $$('.fbtn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat===cat)));
  let n=0;
  const shown=[];
  $$('.pcard').forEach(c=>{const on=cat==='tutti'||c.dataset.cat===cat;c.hidden=!on;if(on){n++;shown.push(c)}});
  $('#shopCount').textContent=`${n} ${n===1?'prodotto':'prodotti'}`;
  if(D.A&&!D.reduce())D.A.animate(shown,{opacity:[0,1],y:[22,0],scale:[.97,1],duration:520,delay:D.A.stagger(55),ease:'outExpo',
    onComplete:()=>shown.forEach(c=>{c.style.removeProperty('transform');c.style.removeProperty('opacity')})}); // leave hover styles in charge
}
function injectLD(){
  const ld={'@context':'https://schema.org','@type':'ItemList',itemListElement:S.catalog.products.map((p,i)=>({
    '@type':'ListItem',position:i+1,item:{'@type':'Product',name:p.name,description:p.desc,brand:{'@type':'Brand',name:'Darta Barber Studio'},
      offers:{'@type':'Offer',priceCurrency:'EUR',price:(S.unit(p,defVid(p))/100).toFixed(2),availability:'https://schema.org/InStock',url:location.origin+location.pathname+'#prodotto/'+p.slug}}}))};
  const s=document.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify(ld);document.head.appendChild(s);
}

/* ---------- 3D snapshots (one renderer, queued in idle time) ---------- */
function setSnap(p,which,url){
  snaps[p.id]=snaps[p.id]||{};snaps[p.id][which]=url;
  const c=$(`.pcard[data-id="${p.id}"]`);if(!c)return;
  const img=c.querySelector('.pcard-img.'+which);
  if(img){img.src=url;img.classList.add('ready')}
  if(which==='a')c.classList.add('shot');
  if(D.cart)D.cart.thumbs(); // late thumbnails: patch images only, never re-render the open drawer
}
async function snapAll(){
  if(started)return;started=true;
  if(!GL.supported()){$$('.pcard').forEach(c=>{const p=S.byId[c.dataset.id];c.querySelector('.pcard-media').append(fallbackArt(p));c.classList.add('shot','art')});return}
  GL.setCatalog(S.catalog.products);
  const ps=S.catalog.products;
  for(const which of ['a','b'])for(const p of ps){
    await idle();
    while(GL.viewer.p)await new Promise(r=>setTimeout(r,250)); // never fight the live viewer for the canvas
    const url=await GL.snapshot(p,{yaw:which==='a'?-.34:.62,pitch:which==='a'?.2:.14,amount:+defVid(p)||0});
    if(url)setSnap(p,which,url);
  }
}
D.onGLLost=()=>{if(D.$('#pdp').open){$('#pdpStage').classList.remove('live')}};
D.onGLRestored=()=>{if(current&&$('#pdp').open)mountViewer()};

/* ---------- product sheet ---------- */
function pips(n){const w=el('span',{class:'pips',role:'img','aria-label':`${n} su 5`});for(let i=1;i<=5;i++)w.append(el('i',{class:i<=n?'on':''}));return w}
function selUnit(){return S.unit(current,vid)}
function syncBuy(){
  $('#pdpPrice').textContent=eur(selUnit())+(current.recurring?' /mese':'');
  $('#pdpQ').textContent=qty;
  $('#pdpAddTxt').replaceChildren('Aggiungi',el('span',{class:'opt',text:' al carrello'}),` \u00B7 ${eur(selUnit()*qty)}`);
  $('#pdpMinus').disabled=qty<=1;$('#pdpPlus').disabled=qty>=9;
}
function fill(p){
  $('#pdpNo').textContent='/'+p.no+' · '+catLabel(p.cat);
  $('#pdpTitle').textContent=p.name;
  $('#pdpTag').textContent=p.tag+' · '+p.size;
  $('#pdpDesc').textContent=p.desc;
  const sv=kitSaving(p),b=$('#pdpBadge');b.hidden=!(sv>0);b.textContent=sv>0?'Risparmi '+eur(sv):'';
  const vars=$('#pdpVars');vars.replaceChildren();vars.hidden=!p.variants;
  if(p.variants){
    vars.append(el('legend',{text:'Importo'}));
    const row=el('div',{class:'chips'});
    p.variants.forEach(v=>{
      const inp=el('input',{type:'radio',name:'pv',value:v.id,id:'pv'+v.id});inp.checked=v.id===vid;
      inp.addEventListener('change',()=>{vid=v.id;syncBuy();GL.viewer.setAmount(+v.id||0);setHeroImg()});
      row.append(el('label',{},inp,el('span',{text:v.label})));
    });
    vars.append(row);
  }
  const sp=$('#pdpSpecs');sp.replaceChildren();
  (p.specs||[]).forEach(([k,n])=>sp.append(el('div',{class:'spec'},el('dt',{text:k}),el('dd',{},pips(n)))));
  const use=$('#pdpUse');use.replaceChildren();(p.use||[]).forEach(t=>use.append(el('li',{text:t})));
  const more=$('#pdpMore');more.replaceChildren();
  const others=S.catalog.products.filter(x=>x.id!==p.id);
  [...others.filter(x=>x.cat!==p.cat),...others.filter(x=>x.cat===p.cat)].slice(0,3).forEach(x=>{
    const a=el('a',{class:'mini',href:'#prodotto/'+x.slug,'data-route':''},el('img',{alt:'',width:96,height:96}),el('span',{},el('b',{text:x.name}),el('small',{text:priceTxt(x)})));
    const u=snaps[x.id]&&snaps[x.id].a;if(u)a.querySelector('img').src=u;
    more.append(a);
  });
  $('#pdpMoreBox').hidden=!more.children.length;
  syncBuy();
}
function setHeroImg(){
  const img=$('#pdpFallback'),u=snaps[current.id]&&snaps[current.id].a;
  if(u){img.src=u;img.hidden=false}else{img.hidden=true;img.removeAttribute('src')}
  img.alt=current.name;
}
async function mountViewer(){
  const tok=++mountTok,p=current,stage=$('#pdpStage'),host=$('#pdpHost');
  stage.classList.remove('live');host.classList.remove('touched');host.replaceChildren();
  setHeroImg();
  if(!GL.supported()){host.append(fallbackArt(p));return}      // no WebGL: a silhouette instead of an empty stage
  await GL.fontsReady();
  if(tok!==mountTok||!$('#pdp').open)return;
  const ok=await GL.viewer.start(host,p,{amount:+vid||0});
  if(tok!==mountTok||!$('#pdp').open)return;                  // a newer mount (or a close) owns the viewer now
  if(ok){stage.classList.add('live');stage.classList.toggle('still',D.reduce())}
}
function openPDP(slug){
  const p=S.bySlug[slug];
  if(!p){D.router.back();return}
  const dlg=$('#pdp'),revived=D.cancelClose(dlg),first=!dlg.open;   // revived: reopened while its exit animation played
  if(!first&&current===p&&!revived)return;
  const prev=current;current=p;qty=1;vid=defVid(p);
  fill(p);
  if(first){dlg.showModal();D.lock(true);dlg.scrollTop=0;$('#pdpInfo').scrollTop=0;
    if(D.A&&!D.reduce())D.A.animate('#pdp .pdp-info > *',{opacity:[0,1],y:[18,0],duration:620,delay:D.A.stagger(45,{start:140}),ease:'outExpo'});
  }else if(prev!==p){                                                 // switched product inside the open sheet
    dlg.scrollTop=0;$('#pdpInfo').scrollTop=0;$('#pdpTitle').focus({preventScroll:true});
    if(D.A&&!D.reduce())D.A.animate('#pdp .pdp-info > *',{opacity:[.2,1],y:[10,0],duration:420,delay:D.A.stagger(30),ease:'outExpo'});
  }
  mountViewer();
  snapAll();
}
function closePDP(){
  const dlg=$('#pdp');if(!dlg.open||dlg._closing)return;
  mountTok++;GL.viewer.stop();
  D.closeDialog(dlg,()=>{current=null});
}
function bind(){
  D.dialogEvents($('#pdp'),()=>{GL.viewer.stop();current=null;mountTok++});
  $('#pdpClose').addEventListener('click',()=>D.router.back());
  $('#pdpMinus').addEventListener('click',()=>{qty=Math.max(1,qty-1);syncBuy()});
  $('#pdpPlus').addEventListener('click',()=>{qty=Math.min(9,qty+1);syncBuy()});
  $('#pdpL').addEventListener('click',()=>GL.viewer.nudge(-.6));
  $('#pdpR').addEventListener('click',()=>GL.viewer.nudge(.6));
  $('#pdpAdd').addEventListener('click',()=>{
    S.add(current.id,vid,qty);
    D.cart.fly($('#pdpStage'),$('#pdpAdd'));
    const t=$('#pdpAddTxt');t.textContent='Aggiunto';$('#pdpAdd').classList.add('done');
    setTimeout(()=>{$('#pdpAdd').classList.remove('done');if(current)syncBuy()},1300);
    D.toast(`${S.lineLabel(current,vid)} nel carrello`,{label:'Apri',fn:()=>D.router.go('#carrello')});
  });
  D.router.reg('prodotto',{isOpen:()=>$('#pdp').open,open:openPDP,close:closePDP});
}

D.shop={
  async init(){
    bind();
    renderShelf();
    // warm the renderer only when the shelf is near, or on demand from a deep link
    const io=new IntersectionObserver(([e])=>{if(e.isIntersecting){io.disconnect();snapAll()}},{rootMargin:'1400px 0px'});
    io.observe($('#shop'));
    if(S.lines.length)idle().then(snapAll); // returning visitor with a saved cart: thumbnails for the drawer
  },
  warm:snapAll,
  snap:id=>snaps[id]&&snaps[id].a
};
})();
