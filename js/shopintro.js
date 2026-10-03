/* Darta shop intro: the hero's dive into the sign dissolves into a dark 3D lineup of the shop's products, in the same pinned stage.
   Scroll drives everything: the camera arrives, a spotlight travels from product to product (each one lifts and turns as it
   comes into focus), the big words assemble letter by letter, then the camera pulls back to the whole counter with a link into the shop.
   The 3D lives in its own WebGL context, created lazily. Without WebGL or with reduced motion the section is plain text and a button. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur,cl}=D,lite=D.lite||(()=>false),tr=D.t;
const journey=$('#journey'),sec=$('#shopIntro');
let canvas=$('#glShop');                          // replaced by the renderer's own canvas once the 3D starts
if(!journey||!canvas||!sec)return;
const root=document.documentElement,wordsEl=$('#siWords'),endEl=$('#siEnd'),kicker=$('.si-kicker',sec);
const J=D.J||{hero:.26,scene:.12};
const sm=e=>e*e*e*(e*(e*6-15)+10),seg=(t,a,b)=>cl((t-a)/(b-a),0,1),lerp=(a,b,t)=>a+(b-a)*t;
const TAN=Math.tan(.25);                         // the renderer's field of view is .5 rad

const LINEUP=['wax','clay','pomata','olio','sale'];          // catalog ids, left to right
const LOOK={wax:{s:.82,yaw:-.3},clay:{s:1.4,yaw:-.35},pomata:{s:1.4,yaw:.15},olio:{s:1.05,yaw:-.2},sale:{s:1.12,yaw:.3}};   // size in the scene and resting turn
const GAP=1.95,N=LINEUP.length,X=i=>(i-(N-1)/2)*GAP;
const ARRIVE=.17,SPOT=[.17,.8],OUTRO=.84;        // scene timeline (q, 0..1): arrival, spotlight tour, closing view

let FG=null,prods=[],words=[],live=false,vis=false,raf=0,cur=0,W=2,H=2,lastDraw=0,booted=false;
const progress=()=>{const r=journey.getBoundingClientRect();return cl(-r.top/Math.max(1,r.height-innerHeight),0,1)};

/* ---------- captions ---------- */
function line(txt){ // one <i> per letter so each word can assemble with a stagger
  const n=el('span',{class:'si-n'});
  [...txt].forEach((ch,i)=>{const c=el('i',{text:ch===' '?' ':ch});c.style.setProperty('--c',i);n.append(c)});
  return n;
}
function buildWords(){
  wordsEl.replaceChildren();words=[];
  const intro=el('div',{class:'si-w'},line(tr('Il banco')),line(tr('di Thomas.')));
  wordsEl.append(intro);words.push(intro);
  prods.forEach(p=>{
    const price=p.variants?tr('da {price}',{price:eur(p.variants[0].price)}):eur(p.price);
    const w=el('div',{class:'si-w'},line(p.name),
      el('span',{class:'si-m'},el('b',{text:price}),el('span',{text:p.short}),
        el('a',{class:'si-go',href:D.url.product(p),tabindex:'-1',text:tr('Scopri')})));
    wordsEl.append(w);words.push(w);
  });
}

/* ---------- scene ---------- */
function camera(a,s,q,time){
  const A=W/H,TANH=TAN*2;
  const hSpot=Math.max(3.4,2.4/A),hWide=Math.max(5.2,Math.min(11/A,9)),hFar=hWide*1.7;
  const i=Math.min(N-1,Math.floor(s)),f=s-i,glide=sm(seg(f,.55,1));
  let cx=lerp(X(i),X(Math.min(N-1,i+1)),glide);
  if(s<=0)cx=X(0);
  const closing=sm(seg(q,OUTRO-.02,OUTRO+.1)),desk=A>1.15;
  cx=lerp(cx,desk?-1.9:0,closing);                 // closing: desktop pushes the counter to the right, away from the text block
  let hv=lerp(hFar,hSpot,sm(a));                   // arrival: dolly in from far away
  hv=lerp(hv,hWide,closing);                       // closing: pull back to the whole counter
  const fr=lerp(desk?.47:.4,desk?.45:.24,closing);   // where the products sit in the frame (phones: above the words)
  return {x:cx+Math.sin(time*.3)*.04,y:.58-(.5-fr)*hv,dist:hv/TANH,pitch:.1};
}
function render(p,time){
  const q=cl((p-J.scene)/(1-J.scene),0,1);
  const a=seg(q,0,ARRIVE),s=seg(q,SPOT[0],SPOT[1])*N;     // s: which product the spotlight is on (0..N)
  const cam=camera(a,s,q,time),closing=sm(seg(q,OUTRO-.02,OUTRO+.1));
  const items=prods.map((p0,j)=>{
    const near=1-cl(Math.abs(cam.x-X(j))/GAP,0,1),focus=sm(near);
    const arrive=sm(seg(a,j*.1,.55+j*.1));                // products rise into place one after the other
    const lookJ=LOOK[p0.id]||{s:1,yaw:0};
    const spotlit=lerp(lerp(.34,1,focus),.95,closing);                // the spotlight follows the camera; the closing view lights everything evenly
    return {p:p0,x:X(j),y:(1-arrive)*-.9+focus*.28*(1-closing)+Math.sin(time*1.3+j)*.012,
      yaw:lookJ.yaw+cl(s-j,-1.5,1.5)*.8*(1-closing)+Math.sin(time*.4+j)*.08*focus,s:lookJ.s,   // each product turns toward you as the spotlight arrives
      dim:spotlit*arrive,glow:(.1+.5*focus)*arrive,lift:focus*(1-closing)};
  });
  FG.scene(items,{time,cam});
  return {q,s,closing};
}
function ui(p){
  const q=cl((p-J.scene)/(1-J.scene),0,1),s=seg(q,SPOT[0],SPOT[1])*N;
  canvas.style.opacity=sm(seg(p,J.scene,J.hero)).toFixed(3);          // fades in underneath the dissolving sign
  const closing=q>OUTRO;
  words.forEach((w,k)=>{
    let on,past;
    if(k===0){on=q>.025&&q<ARRIVE+.01;past=q>=ARRIVE+.01}        // "Il banco di Thomas."
    else{const j=k-1;on=!closing&&s>=j+.06&&s<=j+.62;past=closing||s>j+.62}   // shown while the camera rests on that product, gone while it glides on
    w.classList.toggle('on',on);w.classList.toggle('past',past);
  });
  kicker.classList.toggle('on',q>.03);
  endEl.classList.toggle('on',closing);
}
function tick(now){
  raf=0;if(!vis||!live)return;
  const target=progress(),moving=cur!==target;
  cur+=(target-cur)*.14;if(Math.abs(target-cur)<.0004)cur=target;
  if(cur>J.scene*.6&&(moving||now-lastDraw>(lite()?90:40))){render(cur,now/1000);ui(cur);lastDraw=now}
  raf=requestAnimationFrame(tick);
}
function resize(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,lite()?1.5:2);
  W=Math.max(2,Math.round(r.width*dpr));H=Math.max(2,Math.round(r.height*dpr));FG.setSize(W,H);
  if(live){render(cur,performance.now()/1000)}
}

/* ---------- start ---------- */
async function boot(){
  if(booted||!root.classList.contains('gl')||D.reduce())return;
  booted=true;
  try{
    if(!D.GL.supported()){D.heroOff&&D.heroOff();return}
    FG=D.makeGL({onLost:()=>{live=false;D.heroOff&&D.heroOff()},onRestored:()=>{}});
    if(!FG.init()){D.heroOff&&D.heroOff();return}
    FG.setCatalog(D.store.catalog.products);
    await FG.fontsReady();
    buildWords();
    const c=FG.canvas();c.id='glShop';c.setAttribute('aria-hidden','true');canvas.replaceWith(c);canvas=c;
    sec.classList.add('si-live');live=true;
    new ResizeObserver(()=>{const r=c.getBoundingClientRect();if(r.width)resize()}).observe(c);
    cur=progress();resize();ui(cur);
    new IntersectionObserver(([e])=>{vis=e.isIntersecting;if(vis){cur=progress();if(!raf)raf=requestAnimationFrame(tick)}},{rootMargin:'10% 0px'}).observe(journey);
    vis=true;if(!raf)raf=requestAnimationFrame(tick);
  }catch(err){console.warn('Darta shop intro unavailable',err);D.heroOff&&D.heroOff()}
}
function init(){
  prods=LINEUP.map(id=>D.store.byId[id]).filter(Boolean);
  if(!prods.length||!root.classList.contains('gl')||D.reduce())return;
  // the second WebGL context waits until the visitor starts scrolling (or a few idle seconds), so the hero loads first
  const go=()=>{removeEventListener('scroll',go);boot()};
  addEventListener('scroll',go,{passive:true,once:true});
  setTimeout(go,lite()?7000:2800);
}

// at(p): draw the scene exactly at scroll fraction p, right now (tests, and a clean state after layout changes)
function at(p){if(!live)return null;cur=p;const r=render(p,performance.now()/1000);ui(p);lastDraw=performance.now();return r}

D.shopIntro={init,boot,at};
})();
