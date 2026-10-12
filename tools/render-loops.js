/* Dev tool (not part of the site: /tools answers 404 on Netlify). Renders every frame of each product's own animation (pose + effects)
   at 640x640 and POSTs it to the local dev server, which keeps it in tools/_frames/<slug>/<nnn>.webp. tools/encode-loops.py then
   builds the shop-card videos. The loop is seamless: the pose is at rest at both ends and the camera sways by exactly one period. */
(async()=>{
'use strict';
const D=window.DARTA,log=document.getElementById('log');
const SIZE=640,FPS=30,REST=.7;                          // REST: seconds the product stands still before the loop starts again
const q=new URLSearchParams(location.search),every=Math.max(1,+q.get('every')||1),only=q.get('ids')?q.get('ids').split(','):null;
const bytes=url=>{const b=atob(url.split(',')[1]),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
try{
  const cat=await (await fetch('/data/catalog.json')).json();
  D.GL.setCatalog(cat.products);
  let total=0;
  for(const p of cat.products){
    if(only&&!only.includes(p.id))continue;
    if(p.kind==='card'||p.kind==='kit'||!D.GL.specFor(p).parts.some(x=>x.role==='cap'||x.role==='pump'))continue;
    const play=D.GL.playMs(p)/1000,n=Math.round((play+REST)*FPS);
    for(let i=0;i<n;i+=every){
      const t=Math.min(1,i/(play*FPS)),yaw=-.34+.22*Math.sin(i/n*Math.PI*2);
      const url=await D.GL.snapshot(p,{size:SIZE,quality:.96,yaw,pitch:.2,pose:{t},fx:{t}});
      const r=await fetch(`/__frames/${p.slug}/${String(i).padStart(4,'0')}.webp`,{method:'POST',body:new Blob([bytes(url)],{type:'image/webp'})});
      if(!r.ok)throw new Error('frame not saved: '+r.status);
      total++;log.textContent=`${p.slug} ${i+1}/${n} (${total} frames)`;
    }
  }
  log.textContent=`Done: ${total} frames.`;
}catch(e){log.textContent='Error: '+e.message}
})();
