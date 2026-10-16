/* Darta shop intro: the hero's dive into the sign dissolves into the real products standing on the studio's shelf, in the same pinned stage.
   Scroll drives everything: the camera arrives, a spotlight travels from product to product (each one lifts into the light as it
   comes into focus), the big words assemble letter by letter, then the camera pulls back to the whole counter with a link into the shop.
   The products are photographs (img/cut/<slug>.webp, cut out from the studio packshots), placed in plain DOM with the scene's own
   camera, so they keep true perspective against the shelf. With reduced motion the section is plain text and a button. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,el,eur,cl}=D,lite=D.lite||(()=>false),tr=D.t;
const journey=$('#journey'),sec=$('#shopIntro');
let stage=$('#glShop');                           // the empty placeholder becomes the products' stage once the scene starts
if(!journey||!stage||!sec)return;
const root=document.documentElement,wordsEl=$('#siWords'),endEl=$('#siEnd'),kicker=$('.si-kicker',sec),allEl=$('.si-all',sec);
const J=D.J||{hero:.26,scene:.12};
const sm=e=>e*e*e*(e*(e*6-15)+10),seg=(t,a,b)=>cl((t-a)/(b-a),0,1),lerp=(a,b,t)=>a+(b-a)*t;
const TAN=Math.tan(.25);                         // the scene camera's field of view is .5 rad

const LINEUP=['pomata','clay','olio','sale','curlman','curlcontrol'];          // catalog ids, left to right
// h: height on the counter in scene units (true proportions, small pieces nudged up so they still read); ar: the cutout's width/height
const LOOK={pomata:{h:1.05,ar:1.0376},clay:{h:1.05,ar:.3455},olio:{h:1.6,ar:.2282},sale:{h:1.95,ar:.2283},curlman:{h:1.65,ar:.4295},curlcontrol:{h:1.75,ar:.471}};
const CUT_H=1000;                                // sprites are laid out at the cutouts' full pixel height and scaled down to size
const GROW=1.85;                                 // the closing view pulls far back to fit the row: the products grow with it so they still lead (the widest pair stays inside GAPC)
const GAP=1.95,GAPC=1.5,N=LINEUP.length,X=i=>(i-(N-1)/2)*GAP,XC=i=>(i-(N-1)/2)*GAPC;   // GAPC: the closing view packs the row tighter so all six fit beside the text
const ARRIVE=.17,SPOT=[.17,.8],OUTRO=.84;        // scene timeline (q, 0..1): arrival, spotlight tour, closing view

let sprites=[],prods=[],words=[],live=false,vis=false,raf=0,cur=0,W=2,H=2,cw=1,ch=1,lastDraw=0,lastScroll=0,booted=false,bg=null;
const IDLE_REST=12000;   // the parked product keeps its idle sway this long after the last scroll, then the scene rests (battery)
const progress=()=>{const r=journey.getBoundingClientRect();return cl(-r.top/Math.max(1,r.height-innerHeight),0,1)};

/* ---------- captions ---------- */
function line(txt){ // one <i> per letter so each word can assemble with a stagger; words stay whole, so a long Italian name wraps between words on a phone
  const n=el('span',{class:'si-n'});let i=0;
  txt.split(' ').forEach((word,w)=>{
    if(w)n.append(' ');
    const wd=el('span',{class:'si-wd'});
    [...word].forEach(ch=>{const c=el('i',{text:ch});c.style.setProperty('--c',i++);wd.append(c)});
    n.append(wd);i++;
  });
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
        el('a',{class:'btn btn-p si-go',href:D.url.product(p),tabindex:'-1',text:tr('Acquista')})));
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
// The scene camera as a projector: scene point (x, y, z) -> stage pixels. z = 0 is the front of the counter, where the products stand.
function projector(cam){
  const s=Math.sin(cam.pitch),c=Math.cos(cam.pitch),ex=cam.x,ey=cam.y+s*cam.dist,ez=c*cam.dist,A=cw/ch;
  return (x,y,z)=>{const vy=y-ey,vz=z-ez,zc=-(vy*s+vz*c),yc=vy*c-vz*s;return [((x-ex)/(zc*TAN*A)*.5+.5)*cw,(.5-yc/(zc*TAN)*.5)*ch]};
}
const px=n=>n.toFixed(1);
// One product photo on the counter: base at (x, y), its contact shadow and warm light pool always on the counter itself (y = 0)
function draw(sp,pr,x,y,o){
  const L=sp.look,[bx,by]=pr(x,y,0),ty=pr(x,y+L.h*o.grow,0)[1],h=by-ty,w=h*L.ar;
  sp.el.style.transform=`translate3d(${px(bx-w/2)}px,${px(ty)}px,0) scale(${(h/CUT_H).toFixed(4)})`;
  sp.el.style.opacity=o.arrive.toFixed(3);
  sp.img.style.filter=`brightness(${lerp(.32,1.05,o.dim).toFixed(3)})`;
  if(sp.sheen){sp.sheen.style.opacity=o.sweep.toFixed(3);sp.sheen.style.backgroundPosition=`${(50+o.sx*55).toFixed(1)}% 0`}
  const [fx,fy]=pr(x,0,0),fw=Math.max(w*1.9,h*.9);                     // the floor element is 1000 x 240 px, scaled to the product's footprint
  sp.floor.style.transform=`translate3d(${px(fx-fw/2)}px,${px(fy-fw*.12)}px,0) scale(${(fw/1000).toFixed(4)})`;
  sp.floor.style.opacity=(o.arrive*(1-o.lift*.35)).toFixed(3);           // the slight lift softens the shadow a little
  sp.floor.style.setProperty('--g',o.glow.toFixed(3));
}
function render(p,time){
  const q=cl((p-J.scene)/(1-J.scene),0,1);
  const a=seg(q,0,ARRIVE),s=seg(q,SPOT[0],SPOT[1])*N;     // s: which product the spotlight is on (0..N)
  const cam=camera(a,s,q,time),closing=sm(seg(q,OUTRO-.02,OUTRO+.1)),pr=projector(cam);
  prods.forEach((p0,j)=>{
    const near=1-cl(Math.abs(cam.x-X(j))/GAP,0,1),focus=sm(near);
    const arrive=sm(seg(a,j*.1,.55+j*.1));                // products come into place one after the other
    const spotlit=lerp(lerp(.34,1,focus),.95,closing);    // the spotlight follows the camera; the closing view lights everything evenly
    const lift=focus*(1-closing);
    draw(sprites[j],pr,lerp(X(j),XC(j),closing),(1-arrive)*-.35+lift*.06+Math.sin(time*1.3+j)*.006*focus,   // a photo only hints at the lift: more reads as floating
      {arrive,dim:spotlit,glow:(.1+.5*focus)*arrive,lift,grow:lerp(1,GROW,closing),
       sweep:Math.pow(near,1.5)*.85*arrive*(1-closing),sx:cl((X(j)-cam.x)/GAP,-1,1)});   // the light slides across each product as the camera glides past it
  });
  placeBg(pr,lerp(.62*sm(seg(a,.15,.9)),.92,closing));                   // lights on as the camera arrives, brighter on the whole counter
  return {q,s,closing};
}
// The real shelf (img/counter*.webp, made from the studio's photos) is a wall standing BG.z behind the row, drawn under the products and
// placed with the scene's own camera, so it moves with true parallax. line: where its shelf edge sits (share of the height from the top);
// that edge is put at the counter's height (y = 0).
const BG={w:16,z:-2.6,line:.815,ar:2400/1029};
function placeBg(pr,light){
  if(!bg)return;
  const h=BG.w/BG.ar,[x0,y0]=pr(-BG.w/2,BG.line*h,BG.z),[x1,y1]=pr(BG.w/2,-(1-BG.line)*h,BG.z);
  bg.style.transform=`translate3d(${px(x0)}px,${px(y0)}px,0) scale(${((x1-x0)/1000).toFixed(4)},${((y1-y0)/(1000/BG.ar)).toFixed(4)})`;
  bg.style.opacity=light.toFixed(3);
}
function ui(p){
  const q=cl((p-J.scene)/(1-J.scene),0,1),s=seg(q,SPOT[0],SPOT[1])*N;
  stage.style.opacity=sm(seg(p,J.scene,J.hero*.5+.012)).toFixed(3);   // ready underneath before the light wipe uncovers it
  const closing=q>OUTRO;
  words.forEach((w,k)=>{
    let on,past;
    if(k===0){on=q>.09&&q<ARRIVE+.01;past=q>=ARRIVE+.01}         // "Il banco di Thomas.": once the light wipe has passed the words, so they land on the counter, not on the sign
    else{const j=k-1;on=!closing&&s>=j+.06&&s<=j+.62;past=closing||s>j+.62}   // shown while the camera rests on that product, gone while it glides on
    w.classList.toggle('on',on);w.classList.toggle('past',past);
  });
  kicker.classList.toggle('on',q>.06);
  allEl&&allEl.classList.toggle('on',q>.06&&!closing);   // shop button for the whole product parade; the closing panel has its own
  endEl.classList.toggle('on',closing);
}
function tick(now){
  raf=0;if(!vis||!live)return;
  const target=progress(),moving=cur!==target;
  cur+=(target-cur)*.14;if(Math.abs(target-cur)<.0004)cur=target;
  const shown=cur>J.scene*.6;
  if(shown&&(moving||now-lastDraw>(lite()?90:40))){render(cur,now/1000);ui(cur);lastDraw=now}
  if(!moving&&(!shown||now-lastScroll>IDLE_REST))return;   // nothing to animate on screen: sleep until the next scroll
  raf=requestAnimationFrame(tick);
}
function resize(){
  const r=stage.getBoundingClientRect();
  cw=Math.max(1,r.width);ch=Math.max(1,r.height);W=cw;H=ch;            // the camera only needs the stage's aspect
  if(live){render(cur,performance.now()/1000)}
}
function makeSprites(st){
  const m=lite()?'-m':'';                                               // phones and slow devices get the 560 px cutouts
  sprites=prods.map(p0=>{
    const look=LOOK[p0.id],src=`/img/cut/${p0.slug}${m}.webp`;
    const img=el('img',{src,alt:'',decoding:'async',draggable:'false'});
    const sheen=lite()?null:el('i',{class:'si-sheen'});
    if(sheen)sheen.style.setProperty('--cut',`url("${src}")`);           // the light sweep is masked to the product's own outline
    const box=el('div',{class:'si-p'},img,sheen);box.style.width=`${px(CUT_H*look.ar)}px`;
    const floor=el('i',{class:'si-floor'});
    st.append(floor,box);
    return {el:box,img,sheen,floor,look};
  });
}

/* ---------- start ---------- */
async function boot(){
  if(booted||!root.classList.contains('gl')||D.reduce())return;
  booted=true;
  try{
    if(document.fonts)await document.fonts.ready;
    buildWords();
    const st=el('div',{id:'glShop',class:'si-stage','aria-hidden':'true'});stage.replaceWith(st);stage=st;
    makeSprites(st);
    bg=document.createElement('img');bg.className='si-bg';bg.alt='';bg.setAttribute('aria-hidden','true');bg.decoding='async';
    bg.src=lite()?'/img/counter-m.webp':'/img/counter.webp';st.before(bg);
    sec.classList.add('si-live');live=true;
    new ResizeObserver(()=>{const r=st.getBoundingClientRect();if(r.width)resize()}).observe(st);
    cur=progress();resize();ui(cur);
    startStops();
    new IntersectionObserver(([e])=>{vis=e.isIntersecting;if(vis){cur=progress();if(!raf)raf=requestAnimationFrame(tick)}},{rootMargin:'10% 0px'}).observe(journey);
    vis=true;lastScroll=performance.now();if(!raf)raf=requestAnimationFrame(tick);
    addEventListener('scroll',()=>{lastScroll=performance.now();if(vis&&live&&!raf)raf=requestAnimationFrame(tick)},{passive:true});
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
// to the neighbouring stop (so a hard flick cannot skip a product); when the scroll goes quiet it glides to the next stop in the direction
// the visitor pushed, or stays for a tiny nudge. `rest` (the stop reached last) is the only state: it changes when a stop is really
// reached, so an interrupted glide or a one-pixel rounding difference can never send the page back.
const STOP_S=.34,SETTLE_MS=110,FREE_MS=1600,PUSH=.004,EPS_PX=3,BREAK_MS=800;   // PUSH: a push of this much of the journey (~30px) moves on; BREAK_MS: pushing on without a pause for this long carries you past the stop
const pOfQ=q=>J.scene+q*(1-J.scene);
const stopsP=()=>Array.from({length:N+1},(_,j)=>pOfQ(j<N?SPOT[0]+(j+STOP_S)/N*(SPOT[1]-SPOT[0]):OUTRO+.12));   // N products, then the closing view
const zone=P=>[pOfQ(.14),P[N]+.004];                                  // outside it (the sign dive above, the page below) scrolling is free
const spanPx=()=>Math.max(1,journey.getBoundingClientRect().height-innerHeight);
const yOf=p=>scrollY+journey.getBoundingClientRect().top+p*spanPx();
let rest=-1,settleT=0,glideRaf=0,gliding=false,freeUntil=0,pushT=0;   // rest: the stop reached last (-1 above the tour, N+1 below it); pushT: when the page first hit the next stop's wall
const nearest=(P,p)=>P.reduce((b,x,j)=>Math.abs(x-p)<Math.abs(P[b]-p)?j:b,0);
function glide(y1,done){
  const y0=scrollY,d=y1-y0;
  if(Math.abs(d)<2){done();return}
  gliding=true;const t0=performance.now(),T=Math.min(560,Math.max(260,220+Math.abs(d)*.32));
  const step=now=>{
    const e=Math.min(1,(now-t0)/T);
    scrollTo({top:y0+d*sm(e),behavior:'instant'});                       // instant: the page's own smooth scrolling must not stack on top
    if(!gliding)return;
    if(e<1)glideRaf=requestAnimationFrame(step);else{gliding=false;done()}
  };
  glideRaf=requestAnimationFrame(step);
}
function stopGlide(){if(gliding){gliding=false;cancelAnimationFrame(glideRaf)}}
function settle(){
  const p=progress(),P=stopsP(),[a,b]=zone(P),e=EPS_PX/spanPx();
  pushT=0;
  if(gliding||p<a||p>b||performance.now()<freeUntil)return;
  if(rest<0||rest>N){const i=rest<0?0:N;glide(yOf(P[i]),()=>{rest=i});return}   // came in from above or below: park on the first or last stop
  const d=p-P[rest],i=Math.abs(d)<Math.max(PUSH,e)?rest:d>0?Math.min(N,rest+1):rest-1;
  if(i<0){glide(yOf(a-.015),()=>{rest=-1});return}                     // scrolling up from the first product: leave the tour
  glide(yOf(P[i]),()=>{rest=i});
}
function onStopScroll(){
  const p=progress(),P=stopsP(),[a,b]=zone(P),e=EPS_PX/spanPx();
  if(p<a||p>b){rest=p<a?-1:N+1;return}
  if(performance.now()<freeUntil){rest=nearest(P,p);return}            // a link or anchor jump: let it travel
  const lo=rest<=0?-Infinity:P[rest-1],hi=rest>=N?Infinity:P[rest+1];
  if(p<lo-e||p>hi+e){
    const now=performance.now();pushT=pushT||now;
    if(now-pushT>BREAK_MS){rest=p<lo?rest-1:rest+1;pushT=now}          // never stuck: a long unbroken push carries on to the next stop
    else scrollTo({top:yOf(p<lo?lo:hi),behavior:'instant'});
  }
  clearTimeout(settleT);settleT=setTimeout(settle,SETTLE_MS);
}
function startStops(){
  const p=progress(),P=stopsP(),[a,b]=zone(P);
  rest=p<a?-1:p>b?N+1:nearest(P,p);
  addEventListener('scroll',onStopScroll,{passive:true});
  ['wheel','touchstart','keydown','pointerdown'].forEach(t=>addEventListener(t,stopGlide,{passive:true}));
  addEventListener('click',e=>{if(e.target.closest&&e.target.closest('a[href]'))freeUntil=performance.now()+FREE_MS},true);
}

// at(p): draw the scene exactly at scroll fraction p, right now (tests, and a clean state after layout changes)
function at(p){if(!live)return null;cur=p;const r=render(p,performance.now()/1000);ui(p);lastDraw=performance.now();return r}

D.shopIntro={init,boot,at,stops:stopsP};
})();
