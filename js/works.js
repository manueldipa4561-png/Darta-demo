/* Darta works: the four recent cuts as a scroll-driven deck. The active photo sits in front of its own giant word;
   scrolling slides it away and brings the next one in. Plain DOM and CSS variables, so the photos stay pin sharp.
   With reduced motion the markup stays a swipe rail. */
(()=>{
'use strict';
const D=window.DARTA,{$,$$,cl}=D;
const sec=$('#lavori');
if(!sec||D.reduce())return;
const track=$('.works-track',sec),cards=$$('.cut',sec),wordsEl=$('#worksWords'),counter=$('#worksN'),fill=$('#worksFill'),N=cards.length;
if(!track||N<2)return;

const words=cards.map(c=>{
  const w=document.createElement('span'),txt=c.dataset.word||'';
  w.className='gw';w.textContent=txt;w.style.setProperty('--len',Math.max(3,txt.length));wordsEl.append(w);return w;
});
sec.classList.add('works-live');

let last=-1,raf=0,vis=false;
function update(){
  raf=0;
  const r=track.getBoundingClientRect(),p=cl(-r.top/Math.max(1,r.height-innerHeight),0,1);
  const s=p*(N-1),i0=Math.min(Math.floor(s),N-2),f=s-i0,x=i0+f*f*f*(f*(f*6-15)+10);   // smootherstep between photos: each one lingers
  if(Math.abs(x-last)<.0004)return;
  last=x;
  cards.forEach((c,i)=>{
    const t=i-x,a=Math.min(Math.abs(t),1);
    c.style.setProperty('--t',t.toFixed(4));c.style.setProperty('--a',a.toFixed(4));
    c.style.zIndex=String(20-Math.round(Math.abs(t)*4));c.style.visibility=Math.abs(t)>1.6?'hidden':'visible';
    words[i].style.setProperty('--t',t.toFixed(4));words[i].style.setProperty('--a',a.toFixed(4));
  });
  counter.textContent='0'+(Math.round(x)+1);fill.style.setProperty('--p',p.toFixed(4));
}
const queue=()=>{if(vis&&!raf)raf=requestAnimationFrame(update)};
new IntersectionObserver(([e])=>{vis=e.isIntersecting;last=-1;queue()},{rootMargin:'30% 0px'}).observe(sec);
addEventListener('scroll',queue,{passive:true});
addEventListener('resize',()=>{last=-1;queue()});
})();
