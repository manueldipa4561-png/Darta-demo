/* Darta film: the Wax Powder product film. A pinned stage where scrolling scrubs the real 3D bottle
   (unscrew, tip, pour, screw back) with the same model the shop uses; the captions and the price count follow the same progress.
   Without WebGL or with reduced motion the section stays a still poster with the three steps listed. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,cl}=D,lite=D.lite||(()=>false);
const sec=$('#film');
if(!sec)return;
const root=document.documentElement;
const track=$('.film-track',sec),host=$('#filmGl'),ghost=$('#filmGhost'),buy=$('#filmBuy'),priceEl=$('#filmPrice'),poster=$('#filmPoster');
const steps=$$('.film-step',sec);
const ss=t=>t*t*(3-2*t),seg=(t,a,b)=>cl((t-a)/(b-a),0,1),lerp=(a,b,t)=>a+(b-a)*t;

const SEQ=[.07,.9];                              // scroll range that plays the bottle (sequence time 0..1)
const CAPTIONS=[[.10,.38],[.40,.74],[.76,.93]];  // sequence time each word is on screen: SVITA, SCUOTI, DAI VOLUME
const BUY_AT=.9,PRICE_FROM=4;                     // the price block appears here and counts up from 4 to the real price
const FOV_TAN=Math.tan(.25);                      // the renderer's fixed field of view is .5 rad
let prod=null,FG=null,live=false,vis=false,raf=0,cur=0,W=2,H=2,lastPrice='',lastBuy=null,lastDraw=0;

function splitSteps(){ // one <i> per letter so each word can assemble with a stagger
  steps.forEach(s=>{
    const txt=s.textContent;s.textContent='';
    [...txt].forEach((ch,i)=>{const c=document.createElement('i');c.textContent=ch===' '?' ':ch;c.style.setProperty('--c',i);s.append(c)});
  });
}
const progress=()=>{const r=track.getBoundingClientRect();return cl(-r.top/Math.max(1,r.height-innerHeight),0,1)};
const isDesk=()=>W/H>1.15;   // landscape (desktop, tablet or phone on its side): words left, price right

// camera: how much world fits on screen, and where the bottle sits in the frame.
// Portrait: the bottle sits above the words, and when the price block appears it is fitted into the free band between the brand line and that block
// (measured from the real layout, so short phones like 320x568 never overlap). Landscape: centre-left, price on the right.
// hPour is the visible height while the bottle is tipped and the cap floats away; it must also be wide enough for that pose.
function camera(buyAmt){
  const desk=isDesk(),A=W/H;
  const hPour=Math.max(5.9,3.5/A),hRest=Math.max(3.4,hPour*(desk?.58:.64));
  if(desk)return {dist:hRest/(2*FOV_TAN),ty:.83-(.5-.47)*hRest,zo:hPour/hRest-1};
  const hc=host.clientHeight||1,bs=getComputedStyle(buy);
  const bandTop=108,bandBottom=Math.max(bandTop+120,hc-(parseFloat(bs.bottom)||0)-buy.offsetHeight-6);
  const need=1.97*hc/(bandBottom-bandTop);                       // world height that fits the bottle (1.67) plus its shadow into the band
  const k=lerp(1,Math.max(1.12,need/hRest),buyAmt),f=lerp(.4,(bandTop+(bandBottom-bandTop)*.46)/hc,buyAmt);
  return {dist:hRest*k/(2*FOV_TAN),ty:.83-(.5-f)*hRest*k,zo:hPour/hRest-1};
}
function render(p,time){
  const t=seg(p,SEQ[0],SEQ[1]);
  FG.frame(prod,{yaw:-.16+Math.sin(time*.45)*.05,pitch:.09,time,pose:{t},fx:{t,tint:'light',q:lite()?.45:1},cam:camera(ss(seg(p,.88,.95)))});
}
function ui(p){
  const t=seg(p,SEQ[0],SEQ[1]);
  steps.forEach((s,i)=>{const [a,b]=CAPTIONS[i];s.classList.toggle('on',t>=a&&t<=b);s.classList.toggle('past',t>b)});
  const showBuy=p>=BUY_AT;
  if(showBuy!==lastBuy){buy.classList.toggle('on',showBuy);lastBuy=showBuy}
  const price=prod.price/100,v='€'+Math.round(lerp(PRICE_FROM,price,ss(seg(p,BUY_AT,.965))));
  if(v!==lastPrice){priceEl.textContent=v;lastPrice=v}
  ghost.style.transform=`translate3d(0,${(-p*5).toFixed(2)}svh,0) scale(${(1+p*.05).toFixed(4)})`;
}
function tick(now){
  raf=0;if(!vis||!live)return;
  const target=progress(),moving=cur!==target;
  cur+=(target-cur)*.16;if(Math.abs(target-cur)<.0004)cur=target;
  if(moving||now-lastDraw>(lite()?90:40)){render(cur,now/1000);ui(cur);lastDraw=now}   // standing still: only the gentle float needs a few frames per second
  raf=requestAnimationFrame(tick);
}
function resize(){
  const r=host.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,lite()?1.5:2);
  W=Math.max(2,Math.round(r.width*dpr));H=Math.max(2,Math.round(r.height*dpr));FG.setSize(W,H);
  if(live&&!raf&&vis)raf=requestAnimationFrame(tick);
}

async function stillPoster(){ // no WebGL / reduced motion / GPU reset: the bottle as a picture
  sec.classList.remove('film-live');live=false;
  const gl=D.GL;
  if(gl&&gl.supported()&&!(gl.dead&&gl.dead())){
    gl.setCatalog(D.store.catalog.products);
    const url=await gl.snapshot(prod,{size:640,yaw:-.2,pitch:.1});
    if(url){poster.src=url;poster.alt=prod.name;poster.hidden=false;return}
  }
  if(D.shop&&D.shop.art)poster.replaceWith(D.shop.art(prod));
}

function init(){
  prod=D.store.byId.wax;
  if(!prod){sec.hidden=true;return}
  priceEl.textContent=lastPrice='€'+prod.price/100;
  if(!root.classList.contains('gl')||D.reduce()){stillPoster();return}
  // the second WebGL context, its shaders and label textures wait until the film is actually close (keeps page load light on phones)
  const io=new IntersectionObserver(([e])=>{if(e.isIntersecting){io.disconnect();boot()}},{rootMargin:'150% 0px'});
  io.observe(sec);
}
async function boot(){
  try{
    if(!D.GL.supported()){stillPoster();return}
    FG=D.makeGL({onLost:()=>{stillPoster()},onRestored:()=>{if(FG.init()){FG.setCatalog(D.store.catalog.products);sec.classList.add('film-live');live=true;resize()}}});
    if(!FG.init()){stillPoster();return}
    FG.setCatalog(D.store.catalog.products);
    await FG.fontsReady();
    splitSteps();
    host.append(FG.canvas());
    sec.classList.add('film-live');live=true;
    new ResizeObserver(resize).observe(host);resize();
    const r=sec.getBoundingClientRect();
    vis=r.bottom>-innerHeight*.25&&r.top<innerHeight*1.25;                 // paint right away if it is already on screen
    cur=progress();render(cur,performance.now()/1000);ui(cur);lastDraw=performance.now();
    if(vis&&!raf)raf=requestAnimationFrame(tick);
    new IntersectionObserver(([e])=>{vis=e.isIntersecting;if(vis){cur=progress();if(!raf)raf=requestAnimationFrame(tick)}},{rootMargin:'25% 0px'}).observe(sec);
  }catch(err){console.warn('Darta film unavailable',err);stillPoster()}
}

// refresh(): draw the current scroll position right now (used by tests and after layout changes)
function refresh(){if(!live)return;cur=progress();render(cur,performance.now()/1000);ui(cur);lastDraw=performance.now()}

D.film={init,boot,refresh};
})();
