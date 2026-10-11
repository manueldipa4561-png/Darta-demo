/* Dev tool (not part of the site: /tools answers 404 on Netlify). One row per product, seven moments of its own animation
   (?ids=olio,curlman picks products, ?t=0,.2,... picks the moments). Used to check poses without waiting for the live timeline. */
(async()=>{
'use strict';
const D=window.DARTA,log=document.getElementById('log'),out=document.getElementById('out');
const q=new URLSearchParams(location.search);
try{
  const cat=await (await fetch('/data/catalog.json')).json();
  D.GL.setCatalog(cat.products);
  const ids=q.get('ids')?q.get('ids').split(','):cat.products.filter(p=>p.kind!=='card'&&p.kind!=='kit').map(p=>p.id);
  const ts=(q.get('t')||'0,.12,.25,.4,.55,.7,.9').split(',').map(Number);
  for(const id of ids){
    const p=cat.products.find(x=>x.id===id);if(!p)continue;
    out.append(Object.assign(document.createElement('b'),{textContent:`${p.id} (${p.kind})`}));
    for(const t of ts){
      const url=await D.GL.snapshot(p,{size:300,yaw:-.34,pitch:.2,pose:{t},fx:{t,tint:'dark'}});
      const img=new Image();img.src=url;img.alt=`${id} t=${t}`;out.append(img);
    }
  }
  log.textContent='Done.';
}catch(e){log.textContent='Error: '+e.message}
})();
