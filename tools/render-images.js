/* Dev tool (not part of the site: /tools answers 404 on Netlify).
   Renders each product with the real WebGL renderer and saves img/p/<slug>-a.webp (main view) and -b.webp (second view; for the
   powder it is the moment it pours). The local dev server accepts POST /__save/...; without it, links to download the files appear. */
(async()=>{
'use strict';
const D=window.DARTA,log=document.getElementById('log'),out=document.getElementById('out');
const SIZE=640,QUALITY=.86;
const bytes=url=>{const b=atob(url.split(',')[1]),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
try{
  const cat=await (await fetch('/data/catalog.json')).json();
  D.GL.setCatalog(cat.products);
  let n=0;
  for(const p of cat.products){
    const amount=p.variants?+((p.variants[1]||p.variants[0]).id):0;
    for(const which of ['a','b']){
      const view=which==='a'?{yaw:-.34,pitch:.2}:p.kind==='powder'?{yaw:-.1,pitch:.12,pose:{t:.62},fx:{t:.62,tint:'dark'}}:{yaw:.62,pitch:.14};
      const url=await D.GL.snapshot(p,Object.assign({size:SIZE,quality:QUALITY,amount},view));
      const name=`img/p/${p.slug}-${which}.webp`,data=bytes(url);
      let saved=false;
      try{const r=await fetch('/__save/'+name,{method:'POST',body:new Blob([data],{type:'image/webp'})});saved=r.ok}catch(e){/* no save endpoint */}
      const li=document.createElement('li'),img=new Image();img.src=url;img.width=120;img.height=120;img.alt=name;
      li.append(img,document.createTextNode(` ${name} ${saved?'saved':'download: '}`));
      if(!saved){const a=document.createElement('a');a.href=url;a.download=`${p.slug}-${which}.webp`;a.textContent='save';li.append(a)}
      out.append(li);n++;log.textContent=`${n} of ${cat.products.length*2}`;
    }
  }
  log.textContent=`Done: ${n} images.`;
}catch(e){log.textContent='Error: '+e.message}
})();
