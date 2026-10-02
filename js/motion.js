/* Darta motion: anime.js choreography. Everything here is progressive enhancement:
   without anime.js or with prefers-reduced-motion the page is fully readable and usable. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$}=D,A=D.A;
const root=document.documentElement,reduce=D.reduce();
if(!A||reduce){$('#curtain')&&$('#curtain').remove();root.classList.remove('intro');return}

const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;

/* 1. first-visit curtain: the logo draws in, then travels to the top-left and lands exactly on the header logo
      while two panels wipe away. The header logo stays hidden until the hand-off, so there is never a double or a pop. */
function curtain(){
  const c=$('#curtain');if(!c)return;
  if(!root.classList.contains('intro')){c.remove();return}
  let over=false;
  const done=()=>{if(over)return;over=true;root.classList.remove('intro');c.remove()};
  if(document.hidden){done();return}          // opened in a background tab: don't leave the curtain waiting for frames
  setTimeout(done,4200);                       // failsafe if the timeline is ever throttled
  const logo=$('#curtain .cu-logo'),home=$('.hdr .logo img');
  // measure BEFORE any transform runs: where the header logo sits, relative to the centred loader logo
  const a=logo.getBoundingClientRect(),b=home.getBoundingClientRect();
  const dx=(b.left+b.width/2)-(a.left+a.width/2),dy=(b.top+b.height/2)-(a.top+a.height/2),sc=b.width/a.width;
  const tl=A.createTimeline({defaults:{ease:'outExpo'},onComplete:done})
    .add(logo,{opacity:[0,1],y:[26,0],duration:760},0)
    .add('#curtain .cu-line',{scaleX:[0,1],duration:980},120)
    .add('#curtain .cu-line',{opacity:[1,0],duration:300,ease:'inQuad'},980)
    .add(logo,{x:dx,y:dy,scale:sc,duration:1050,ease:'inOutExpo'},1000)
    .add('#curtain .cu-p',{scaleY:[1,0],duration:820,delay:A.stagger(90),ease:'inOutExpo'},1180);
  D.motion&&(D.motion.tl=tl);
}

/* 2. count-ups on the proof numbers */
function counters(){
  $$('[data-count]').forEach(n=>{
    const to=parseFloat(n.dataset.count),dec=+n.dataset.dec||0,node=n.firstChild,o={v:0};
    const fmt=v=>v.toLocaleString('it-IT',{minimumFractionDigits:dec,maximumFractionDigits:dec});
    const io=new IntersectionObserver(([e])=>{
      if(!e.isIntersecting)return;io.disconnect();
      node.textContent=fmt(0);n.classList.remove('cnt-wait');
      A.animate(o,{v:to,duration:1700,ease:'outExpo',onUpdate:()=>{node.textContent=fmt(o.v)},onComplete:()=>{node.textContent=fmt(to)}});
    },{threshold:.6});
    n.classList.add('cnt-wait');io.observe(n);   // the real value stays in the markup until the count-up starts
  });
}

/* 3. words light up with scroll progress (never below 3:1 contrast: the statement is large text) */
function scrub(){
  $$('.scrub').forEach(p=>{
    let split;try{split=A.splitText(p,{words:true})}catch(e){return}
    if(!split||!split.words||!split.words.length)return;
    p.classList.add('scrubbing');
    A.animate(split.words,{opacity:[.42,1],ease:'linear',delay:A.stagger(60),
      autoplay:A.onScroll({target:p,enter:'bottom 90%',leave:'top 40%',sync:.25})});
  });
}

/* 4. magnetic call-to-actions (fine pointers only) */
function magnets(){
  if(!fine)return;
  $$('.mag').forEach(b=>{
    const a=A.createAnimatable(b,{x:420,y:420,ease:'out(3)'});
    b.addEventListener('pointermove',e=>{const r=b.getBoundingClientRect();a.x(((e.clientX-r.left)/r.width-.5)*14);a.y(((e.clientY-r.top)/r.height-.5)*10)});
    b.addEventListener('pointerleave',()=>{a.x(0);a.y(0)});
  });
}

/* 5. section headings: words rise out of a mask when they scroll in */
function heads(){
  $$('[data-split]').forEach(h=>{
    let sp;try{sp=A.splitText(h,{chars:true})}catch(e){return}
    if(!sp||!sp.chars)return;
    sp.chars.forEach(c=>{c.style.opacity='0'});
    const io=new IntersectionObserver(([e])=>{
      if(!e.isIntersecting)return;io.disconnect();
      A.animate(sp.chars,{opacity:[0,1],y:['70%',0],rotateX:[-60,0],duration:760,delay:A.stagger(22),ease:'outExpo'});
    },{threshold:.4,rootMargin:'0px 0px -6% 0px'});io.observe(h);
  });
}

/* 6. ticker speeds up with scroll velocity (playbackRate keeps the loop seamless) */
function ticker(){
  const t=$('#tick .tick-track');if(!t)return;
  let last=scrollY,boost=0,run=false;
  const loop=()=>{
    boost*=.93;if(boost<.03)boost=0;
    const an=t.getAnimations()[0];if(an)an.playbackRate=1+boost;
    run=boost>0;if(run)requestAnimationFrame(loop);
  };
  addEventListener('scroll',()=>{boost=Math.min(7,boost+Math.abs(scrollY-last)*.014);last=scrollY;if(!run){run=true;requestAnimationFrame(loop)}},{passive:true});
}

D.motion={curtain,counters,scrub,magnets,heads,ticker,init(){curtain();counters();scrub();magnets();heads();ticker()}};
})();
