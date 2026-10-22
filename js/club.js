/* Darta Card: the card members get with a subscription. Visitors can design it (saved in localStorage, the thank-you page
   sends it to the wallet); only the salon stamps it, so the stamps here are a fixed example. */
(()=>{
'use strict';
const D=window.DARTA,{$}=D,tr=D.t;
/* Darta Card: customise, tilt */
(()=>{
  const lc=$('#lc'), box=$('#stamps'), K='darta-card', EXAMPLE=3;   // stamps shown on the preview
  let s={name:'',f:'onyx',ic:'scissors',b:'Thomas'};
  const OK={f:['onyx','gobetti','chrome','holo'],ic:['scissors','bolt','crown','fire'],b:['Thomas','Mattia','Rrapi']};
  try{const v=JSON.parse(localStorage.getItem(K))||{};
    if(typeof v.name==='string')s.name=v.name.slice(0,16);
    for(const k in OK)if(OK[k].includes(v[k]))s[k]=v[k];}catch(e){/* corrupt or blocked storage: start fresh */}
  const save=()=>{try{localStorage.setItem(K,JSON.stringify(s))}catch(e){/* storage blocked */}};
  for(let i=1;i<=10;i++){const d=document.createElement('span');d.className='stamp'+(i===10?' gift':'');const b=document.createElement('b');b.textContent=i===10?'FREE':String(i);
    const NS='http://www.w3.org/2000/svg',sv=document.createElementNS(NS,'svg'),us=document.createElementNS(NS,'use');
    sv.setAttribute('viewBox','0 0 256 256');sv.setAttribute('aria-hidden','true');us.setAttribute('href','#i-scissors');sv.appendChild(us);
    d.append(b,sv);box.appendChild(d)}
  const st=[...box.children];
  function render(){
    lc.dataset.f=s.f;
    $('#lcName').textContent=s.name.trim()||tr('Il tuo nome');
    $('#lcBarber').textContent=s.b;
    $('#lcCount').firstChild.textContent=EXAMPLE;
    st.forEach((d,i)=>{d.classList.toggle('on',i<EXAMPLE);d.querySelector('use').setAttribute('href','#i-'+s.ic)});
  }
  // form -> state
  const nm=$('#inName');nm.value=s.name;
  nm.addEventListener('input',()=>{s.name=nm.value;render();save()});
  [['f','#inFinish'],['ic','#inIcon'],['b','#inBarber']].forEach(([k,sel])=>{
    const box=$(sel),r=box.querySelector(`input[value="${s[k]}"]`);r&&(r.checked=true);
    box.addEventListener('change',e=>{if(OK[k].includes(e.target.value)){s[k]=e.target.value;render();save()}});
  });
  // tilt: pointer on desktop, drag on touch (vertical scroll stays native)
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const set=(x,y)=>{lc.style.setProperty('--ry',(x-.5)*22+'deg');lc.style.setProperty('--rx',(.5-y)*18+'deg');lc.style.setProperty('--mx',x*100+'%');lc.style.setProperty('--my',y*100+'%')};
    const at=e=>{const r=lc.getBoundingClientRect();set(cl01((e.clientX-r.left)/r.width),cl01((e.clientY-r.top)/r.height))};
    const cl01=v=>Math.max(0,Math.min(1,v));
    lc.addEventListener('pointermove',e=>{lc.classList.add('drag');at(e)});
    lc.addEventListener('pointerleave',()=>{lc.classList.remove('drag');set(.5,.3)});
    lc.addEventListener('pointerup',()=>{if(e_touch){lc.classList.remove('drag');set(.5,.3)}});
    let e_touch=false;lc.addEventListener('pointerdown',e=>{e_touch=e.pointerType!=='mouse';at(e)});
    // idle shimmer on phones so the card feels alive without touching it
    new IntersectionObserver(([en])=>{lc.classList.toggle('idle',en.isIntersecting)},{threshold:.6}).observe(lc);
  }
  render();
})();
})();
