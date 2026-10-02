/* Darta core: tiny helpers shared by every module (loaded first, no dependencies). */
(()=>{
'use strict';
const D=window.DARTA=window.DARTA||{};
const mq=matchMedia('(prefers-reduced-motion: reduce)');

D.$=(s,r=document)=>r.querySelector(s);
D.$$=(s,r=document)=>[...r.querySelectorAll(s)];
D.reduce=()=>mq.matches;
D.cl=(v,a,b)=>Math.max(a,Math.min(b,v));
D.A=window.anime||null; // anime.js v4 (vendored), null-safe: every caller falls back to CSS

// reveal-on-scroll: add class "rv" in markup, or call D.reveal(el) for nodes created later
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
D.reveal=el=>io.observe(el);

// page scroll lock while a modal is open (counted so nested dialogs stay safe)
let locks=0;
D.lock=on=>{locks=Math.max(0,locks+(on?1:-1));document.documentElement.classList.toggle('lock',locks>0)};

// modal lifecycle shared by every dialog: idempotent animated close, revivable while it plays,
// and a backdrop click that only counts when the press also started on the backdrop
D.closeDialog=(dlg,after)=>{
  if(!dlg.open||dlg._closing)return;
  dlg._closing=true;dlg.classList.add('out');
  dlg._t=setTimeout(()=>{dlg._closing=false;dlg._silent=true;dlg.close();dlg.classList.remove('out');D.lock(false);after&&after()},D.reduce()?0:170);
};
D.cancelClose=dlg=>{if(!dlg._closing)return false;clearTimeout(dlg._t);dlg._closing=false;dlg.classList.remove('out');return true};
D.dialogEvents=(dlg,onUserClose)=>{
  // 'close' fires asynchronously: closes started by closeDialog are flagged _silent and must not navigate again
  dlg.addEventListener('close',()=>{if(dlg._silent){dlg._silent=false;return}D.lock(false);onUserClose&&onUserClose();D.router.back()});
  dlg.addEventListener('cancel',e=>{e.preventDefault();D.router.back()});
  let down=null;
  dlg.addEventListener('pointerdown',e=>{down=e.target});
  dlg.addEventListener('click',e=>{if(e.target===dlg&&down===dlg)D.router.back();down=null});
};

// 1600 -> "16€", 490 -> "4,90€"
D.eur=c=>(c/100).toLocaleString('it-IT',{minimumFractionDigits:c%100?2:0,maximumFractionDigits:2})+'€';

D.el=(tag,props,...kids)=>{
  const e=document.createElement(tag);
  if(props)for(const k in props){
    if(k==='class')e.className=props[k];
    else if(k==='text')e.textContent=props[k];
    else if(k==='style')e.style.cssText=props[k];          // CSSOM write: no 'unsafe-inline' needed for it
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),props[k]);
    else if(props[k]!==false&&props[k]!=null)e.setAttribute(k,props[k]===true?'':props[k]);
  }
  kids.flat().forEach(c=>c!=null&&e.append(c.nodeType?c:document.createTextNode(c)));
  return e;
};

// svg icon from the sprite
D.icon=(id,cls='i')=>{
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('class',cls);s.setAttribute('aria-hidden','true');
  const u=document.createElementNS('http://www.w3.org/2000/svg','use');
  u.setAttribute('href','#'+id);s.appendChild(u);return s;
};

// toast with optional action button
D.toast=(msg,action)=>{
  const t=D.$('#toast');if(!t)return;
  const host=document.querySelector('dialog[open]')||document.body; // modals live in the top layer: carry the toast in with them
  if(t.parentNode!==host)host.append(t);
  t.replaceChildren(D.el('span',{text:msg}));
  if(action){
    t.append(D.el('button',{class:'toast-act',type:'button',text:action.label,onclick:()=>{t.classList.remove('show');action.fn()}}));
    t.classList.add('has-act');
  }else t.classList.remove('has-act');
  t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),action?4200:2600);
};

// history-aware routes: #prodotto/<slug>, #carrello, #checkout
D.router={
  routes:{},
  reg(name,r){this.routes[name]=r},
  parse(){                          // '#prodotto/<slug>' | '#carrello' | '#checkout'; the slug may only hold [A-Za-z0-9_-]
    const h=location.hash.slice(1),i=h.indexOf('/'),name=i<0?h:h.slice(0,i),arg=i<0?'':h.slice(i+1);
    return (name==='prodotto'||name==='carrello'||name==='checkout')&&/^[\w-]*$/.test(arg)?{name,arg}:null;
  },
  go(h){if(location.hash!==h)history.pushState({dr:1},'',h);this.sync()},
  back(){
    if(history.state&&history.state.dr){history.back();return}
    this.reset();
  },
  reset(){history.replaceState(null,'','#shop');this.sync();const s=document.getElementById('shop');s&&s.scrollIntoView({behavior:'instant'})},
  sync(){
    const r=this.parse();
    for(const k in this.routes){const x=this.routes[k];if((!r||r.name!==k)&&x.isOpen())x.close()}
    if(r&&this.routes[r.name])this.routes[r.name].open(r.arg);
  }
};
// Back/Forward fire both events; sync() is idempotent and flags the pass as a history traversal
const nav=()=>{D.router.nav=true;D.router.sync();D.router.nav=false};
addEventListener('popstate',nav);
addEventListener('hashchange',nav);
document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('a[data-route]');
  if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
  e.preventDefault();D.router.go(a.getAttribute('href'));
});
})();
