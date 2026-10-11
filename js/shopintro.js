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

const LINEUP=['pomata','clay','olio','sale','curlman','curlcontrol'];          // catalog ids, left to right
const LOOK={clay:{s:.82,yaw:-.3},pomata:{s:1.15,yaw:.1,tilt:1.15,c:[.55,.28]},olio:{s:.82,yaw:-.2},sale:{s:.76,yaw:.3},curlman:{s:.82,yaw:-.25},curlcontrol:{s:.94,yaw:.2}};   // size in the scene and resting turn
const GAP=1.95,GAPC=1.5,N=LINEUP.length,X=i=>(i-(N-1)/2)*GAP,XC=i=>(i-(N-1)/2)*GAPC;   // GAPC: the closing view packs the row tighter so all six fit beside the text
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
  const closing=sm(seg(q,OUTRO-.02,OUTRO+.1)),desk=A>1.15;
  const hSpot=Math.max(3.4,2.4/A),hFar=Math.max(5.2,Math.min(11/A,9))*1.7;
  const fw=desk?cl(.44+(A-1.33)*.4,.44,.62):.94;                        // share of the frame the closing row may take: the rest is the text block (wider screens leave more room)
  const hWide=Math.max(5.2,((N-1)*GAPC+2)/fw/A);                    // closing: the whole row fits in that share
  const i=Math.min(N-1,Math.floor(s)),f=s-i,glide=sm(seg(f,.55,1));
  let cx=lerp(X(i),X(Math.min(N-1,i+1)),glide);
  if(s<=0)cx=X(0);
  cx=lerp(cx,desk?-(.48-fw/2)*hWide*A:0,closing);         // closing: desktop pushes the counter to the right, away from the text block
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
    return {p:p0,x:lerp(X(j),XC(j),closing),y:(1-arrive)*-.9+focus*.28*(1-closing)+Math.sin(time*1.3+j)*.012,
      yaw:lookJ.yaw+(lookJ.tilt?0:cl(s-j,-1.5,1.5)*.8*(1-closing))+Math.sin(time*.4+j)*.08*focus,s:lookJ.s,tilt:lookJ.tilt,tiltC:lookJ.c,   // each product turns toward you as the spotlight arrives
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
    startStops();
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

/* ---------- stops: the scroll parks on every product ---------- */
// The tour rests on each product (STOP_S into its turn) and on the closing view. While the visitor scrolls, the page may travel at most
// to the neighbouring stop (so a hard flick cannot skip a product); when the scroll goes quiet it glides on to the stop in the direction
// the visitor was heading (or stays, for a tiny nudge). `rest` only changes when a stop is really reached, so a glide that the next
// wheel notch interrupts still ends up going forward.
const STOP_S=.34,SETTLE_MS=110,FREE_MS=1600,PUSH=.003;                 // PUSH: a nudge of this much (of the journey, ~25px) already moves on
const pOfQ=q=>J.scene+q*(1-J.scene);
const stopsP=()=>Array.from({length:N+1},(_,j)=>pOfQ(j<N?SPOT[0]+(j+STOP_S)/N*(SPOT[1]-SPOT[0]):OUTRO+.12));   // N products, then the closing view
const zone=P=>[pOfQ(.14),P[N]+.004];                                  // outside it (the sign dive above, the page below) scrolling is free
const yOf=p=>{const r=journey.getBoundingClientRect();return scrollY+r.top+p*Math.max(1,r.height-innerHeight)};
let rest=-1,dir=1,lastY=0,ownY=null,settleT=0,glideRaf=0,gliding=false,freeUntil=0;   // rest: the stop reached last (-1 above the tour, N+1 below it)
const nearest=(P,p)=>P.reduce((b,x,j)=>Math.abs(x-p)<Math.abs(P[b]-p)?j:b,0);
function glide(y1,done){
  const y0=scrollY,d=y1-y0;
  if(Math.abs(d)<2){done();return}
  gliding=true;const t0=performance.now(),T=Math.min(560,Math.max(260,220+Math.abs(d)*.32));
  const step=now=>{
    const e=Math.min(1,(now-t0)/T);
    ownY=y0+d*sm(e);scrollTo({top:ownY,behavior:'instant'});            // instant: the page's own smooth scrolling must not stack on top
    if(!gliding)return;
    if(e<1)glideRaf=requestAnimationFrame(step);else{gliding=false;done()}
  };
  glideRaf=requestAnimationFrame(step);
}
function stopGlide(){if(gliding){gliding=false;cancelAnimationFrame(glideRaf)}}
function settle(){
  const p=progress(),P=stopsP(),[a,b]=zone(P);
  if(gliding||p<a||p>b||performance.now()<freeUntil)return;
  if(rest<0||rest>N){const i=rest<0?0:N;glide(yOf(P[i]),()=>{rest=i});return}   // came in from above or below: park on the first or last stop
  let i=rest;
  if(Math.abs(p-P[rest])>=PUSH){
    let lo=-1;while(lo<N&&P[lo+1]<=p+1e-4)lo++;                        // the last stop at or before the page
    i=Math.abs(p-P[Math.max(lo,0)])<1e-4&&lo>=0?lo:dir>0?Math.min(N,lo+1):lo;
  }
  if(i<0){glide(yOf(a-.015),()=>{rest=-1});return}                     // scrolling up from the first product: leave the tour
  glide(yOf(P[i]),()=>{rest=i});
}
function onStopScroll(){
  const y=scrollY,p=progress(),P=stopsP(),[a,b]=zone(P),free=performance.now()<freeUntil;
  if(ownY!==null&&Math.abs(y-ownY)<1.5)ownY=null;                        // our own move (glide or clamp), not the visitor's
  else{if(y>lastY+.5)dir=1;else if(y<lastY-.5)dir=-1}
  lastY=y;
  if(p<a||p>b){rest=p<a?-1:N+1;return}
  if(free){rest=nearest(P,p);return}                                   // a link or anchor jump: let it travel
  const lo=rest<=0?-Infinity:P[rest-1],hi=rest>=N?Infinity:P[rest+1];
  if(p<lo||p>hi){ownY=yOf(p<lo?lo:hi);scrollTo({top:ownY,behavior:'instant'})}
  clearTimeout(settleT);settleT=setTimeout(settle,SETTLE_MS);
}
function startStops(){
  const p=progress(),P=stopsP(),[a,b]=zone(P);
  rest=p<a?-1:p>b?N+1:nearest(P,p);lastY=scrollY;
  addEventListener('scroll',onStopScroll,{passive:true});
  ['wheel','touchstart','keydown','pointerdown'].forEach(t=>addEventListener(t,stopGlide,{passive:true}));
  addEventListener('click',e=>{if(e.target.closest&&e.target.closest('a[href]'))freeUntil=performance.now()+FREE_MS},true);
}

// at(p): draw the scene exactly at scroll fraction p, right now (tests, and a clean state after layout changes)
function at(p){if(!live)return null;cur=p;const r=render(p,performance.now()/1000);ui(p);lastDraw=performance.now();return r}

D.shopIntro={init,boot,at,stops:stopsP};
})();
