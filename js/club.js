/* Darta club: customisable loyalty card (state in localStorage). */
(()=>{
'use strict';
const D=window.DARTA,{$}=D;
/* loyalty card: customise, stamp, tilt */
(()=>{
  const lc=$('#lc'), box=$('#stamps'), txt=$('#stampTxt'), K='darta-card';
  let s={name:'',f:'onyx',ic:'scissors',b:'Thomas',n:0};
  const OK={f:['onyx','gobetti','chrome','holo'],ic:['scissors','bolt','crown','fire'],b:['Thomas','Mattia','Rrapi']};
  try{const v=JSON.parse(localStorage.getItem(K))||{};
    if(typeof v.name==='string')s.name=v.name.slice(0,16);
    for(const k in OK)if(OK[k].includes(v[k]))s[k]=v[k];
    if(Number.isInteger(v.n)&&v.n>=0&&v.n<=10)s.n=v.n;}catch(e){/* corrupt or blocked storage: start fresh */}
  const save=()=>{try{localStorage.setItem(K,JSON.stringify(s))}catch(e){/* storage blocked */}};
  for(let i=1;i<=10;i++){const d=document.createElement('span');d.className='stamp'+(i===10?' gift':'');const b=document.createElement('b');b.textContent=i===10?'FREE':String(i);
    const NS='http://www.w3.org/2000/svg',sv=document.createElementNS(NS,'svg'),us=document.createElementNS(NS,'use');
    sv.setAttribute('viewBox','0 0 256 256');sv.setAttribute('aria-hidden','true');us.setAttribute('href','#i-scissors');sv.appendChild(us);
    d.append(b,sv);box.appendChild(d)}
  const st=[...box.children];
  function render(){
    lc.dataset.f=s.f;
    $('#lcName').textContent=s.name.trim()||'Il tuo nome';
    $('#lcBarber').textContent=s.b;
    $('#lcCount').firstChild.textContent=s.n;
    $('#lcTier').textContent=s.n>=10?'Gold':s.n>=5?'Regular':'Member';
    st.forEach((d,i)=>{d.classList.toggle('on',i<s.n);d.querySelector('use').setAttribute('href','#i-'+s.ic)});
    if(s.n>=10){const b=document.createElement('b');b.textContent='Taglio omaggio sbloccato.';txt.replaceChildren(b,' Tocca Timbra per ricominciare.')}
    else txt.textContent=s.n===0?'Il decimo taglio è omaggio.':`Ancora ${10-s.n} ${10-s.n===1?'taglio':'tagli'} al taglio omaggio.`;
  }
  // form -> state
  const nm=$('#inName');nm.value=s.name;
  nm.addEventListener('input',()=>{s.name=nm.value;render();save()});
  [['f','#inFinish'],['ic','#inIcon'],['b','#inBarber']].forEach(([k,sel])=>{
    const box=$(sel),r=box.querySelector(`input[value="${s[k]}"]`);r&&(r.checked=true);
    box.addEventListener('change',e=>{if(OK[k].includes(e.target.value)){s[k]=e.target.value;render();save()}});
  });
  $('#stampBtn').onclick=()=>{
    s.n=s.n>=10?0:s.n+1;render();save();
    if(s.n===10){lc.classList.remove('full');void lc.offsetWidth;lc.classList.add('full')}
    navigator.vibrate&&navigator.vibrate(s.n===10?[30,40,60]:18);
  };
  $('#walletBtn').onclick=()=>D.toast('Demo: qui la tessera si aggiunge ad Apple o Google Wallet.');
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
