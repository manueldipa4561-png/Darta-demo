/* Darta journey: raw-WebGL hero. The camera dives into the salon sign, and the sign dissolves into the shop scene (js/shopintro.js)
   that sits underneath the same pinned stage. Falls back to the plain photo when WebGL is off. */
(()=>{
'use strict';
const {$,$$}=window.DARTA,lite=window.DARTA.lite||(()=>false);   // lite: phone-class device (older core.js may not have it yet)
const root=document.documentElement,hdr=$('#hdr'),dock=$('#dock'),journey=$('#journey');
/* header + dock without GL */
function plainChrome(){
  new IntersectionObserver(([e])=>{dock.classList.toggle('show',!e.isIntersecting);hdr.classList.toggle('solid',!e.isIntersecting)}).observe($('.hero-copy .cta-row'));
}

/* ===== WebGL 3D scroll journey (raw WebGL1, no library) ===== */
const canvas=$('#gl');
const gl=root.classList.contains('gl')&&canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){root.classList.remove('gl');plainChrome();return}

const VS=`attribute vec2 aP;uniform mat4 uM;uniform float uBend;varying vec2 vUv;
void main(){vUv=aP+.5;vec3 p=vec3(aP,0.);p.z+=sin(vUv.x*3.14159)*uBend;gl_Position=uM*vec4(p,1.);}`;
const FS=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uT;uniform vec2 uC,uS,uPx;uniform float uA,uSat,uW,uTm,uR,uDk,uSh;varying vec2 vUv;
void main(){vec2 uv=(vUv-.5)*uC+.5;uv.x+=sin(uv.y*11.+uTm*2.2)*uW*.012;float s=uW*.007;
vec3 c=vec3(texture2D(uT,uv+vec2(s,0.)).r,texture2D(uT,uv).g,texture2D(uT,uv-vec2(s,0.)).b);
vec2 o=uPx*uC;vec3 bl=(texture2D(uT,uv+vec2(o.x,0.)).rgb+texture2D(uT,uv-vec2(o.x,0.)).rgb+texture2D(uT,uv+vec2(0.,o.y)).rgb+texture2D(uT,uv-vec2(0.,o.y)).rgb)*.25;
c=clamp(c+(c-bl)*uSh,0.,1.); // unsharp mask, one screen pixel wide
float g=dot(c,vec3(.299,.587,.114));c=mix(vec3(g),c,uSat)*uDk;
c*=vec3(.96,1.,1.015);c+=(fract(sin(dot(gl_FragCoord.xy+uTm*61.,vec2(12.9898,78.233)))*43758.5453)-.5)*.02;
vec2 q=abs(vUv-.5)*uS;vec2 h=uS*.5-uR;vec2 e=q-h;float d=length(max(e,0.))+min(max(e.x,e.y),0.)-uR;float m=uR>0.?1.-smoothstep(-.006,.006,d):1.;
float v=smoothstep(.9,.3,length(vUv-.5));gl_FragColor=vec4(c*mix(.72,1.,v),m*uA);}`;
function sh(t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);return s}
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){root.classList.remove('gl');plainChrome();return}
gl.useProgram(pr);
const U={};['uM','uBend','uT','uC','uS','uPx','uSh','uA','uSat','uW','uTm','uR','uDk'].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
// subdivided quad so planes can bend with scroll speed
const N=16,pos=[],idx=[];
for(let y=0;y<=N;y++)for(let x=0;x<=N;x++)pos.push(x/N-.5,y/N-.5);
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const a=y*(N+1)+x,b=a+1,c=a+N+1,d=c+1;idx.push(a,c,b,b,c,d)}
gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
const aP=gl.getAttribLocation(pr,'aP');gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,2,gl.FLOAT,false,0,0);
gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(11/255,11/255,10/255,1);gl.uniform1i(U.uT,0);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);

const ANISO=gl.getExtension('EXT_texture_filter_anisotropic'),MAXTEX=Math.min(lite()?1024:2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));   // phones: a 1024 texture is plenty and a quarter of the memory
const potNear=n=>Math.pow(2,Math.round(Math.log2(Math.max(2,n))));
// Photos are resampled once to a power-of-two canvas so the GPU can build mipmaps: big uploads then shrink cleanly
// (no shimmer) and small ones are not sharpened by accident. UVs are normalised, so the stretch is invisible.
function tex(src){return new Promise((res,rej)=>{const im=new Image();im.decoding='async';im.onload=()=>{try{
  const W0=im.naturalWidth,H0=im.naturalHeight,k=Math.min(1,MAXTEX/Math.max(W0,H0));
  const w=Math.min(MAXTEX,potNear(W0*k)),h=Math.min(MAXTEX,potNear(H0*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(im,0,0,w,h);
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  if(ANISO)gl.texParameterf(gl.TEXTURE_2D,ANISO.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ANISO.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  res({t,a:W0/H0})}catch(e){rej(e)}};im.onerror=rej;im.src=src})}

// column-major mat4
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
function persp(f,a,n,fa){const t=1/Math.tan(f/2),nf=1/(n-fa);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(fa+n)*nf,-1,0,0,2*fa*n*nf,0])}
function model(x,y,z,ry,sx,sy){const c=Math.cos(ry),s=Math.sin(ry);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s,0,c,0,x,y,z,1])}
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));

// scene: the hero sign plane at z=0; the camera starts back at Z0 and dives toward it
const FOV=45*Math.PI/180,TAN=Math.tan(FOV/2),Z0=3.2,ZE=1.1,J=window.DARTA.J||{hero:.26,scene:.12};
let ASP=1,dirty=true,P,hero=null,cur=Z0,vel=0,raf=0,visible=true;
const heroCopy=$('#heroCopy');

function layout(){
  const W=canvas.clientWidth,H=canvas.clientHeight;if(!W||!H)return;
  const A=W/H,dpr=Math.min(devicePixelRatio||1,lite()?1.5:2); // native sharpness on retina screens, lighter on phones
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);gl.viewport(0,0,canvas.width,canvas.height);
  ASP=A;P=persp(FOV,A,.05,60);
  if(hero){hero.h=2*Z0*TAN*1.08;hero.w=hero.h*A}
  dirty=true;draw();
}
function plane(o,alpha,sat,bend,wave,rad,dark,ry){
  const V=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-cur,1]);
  gl.uniformMatrix4fv(U.uM,false,mul(P,mul(V,model(o.x,o.y,o.z,ry,o.w,o.h))));
  const pa=o.w/o.h;gl.uniform2f(U.uC,pa>o.a?1:pa/o.a,pa>o.a?o.a/pa:1);
  const dz=Math.max(.05,cur-o.z),pxW=o.w/(2*dz*TAN*ASP)*canvas.width,pxH=o.h/(2*dz*TAN)*canvas.height;
  gl.uniform2f(U.uPx,1/Math.max(1,pxW),1/Math.max(1,pxH));gl.uniform1f(U.uSh,.55*(1-cl(Math.abs(vel)*3,0,.6)));
  gl.uniform2f(U.uS,o.w,o.h);gl.uniform1f(U.uA,alpha);gl.uniform1f(U.uSat,sat);
  gl.uniform1f(U.uBend,bend);gl.uniform1f(U.uW,wave);gl.uniform1f(U.uR,rad);gl.uniform1f(U.uDk,dark);
  gl.bindTexture(gl.TEXTURE_2D,o.t);gl.drawElements(gl.TRIANGLES,idx.length,gl.UNSIGNED_SHORT,0);
}
function draw(){
  if(!hero||!P||canvas.style.opacity!==''&&+canvas.style.opacity<.01)return;   // fully dissolved: nothing to paint
  gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(U.uTm,performance.now()/1000);
  const dive=cl((Z0-cur)/Z0,0,1);
  plane(hero,cl((cur-.12)/1.1,0,1),1-dive*.5,0,cl(Math.abs(vel)*5,0,.7)+dive*.7,0,.66,0);
}
const smoother=e=>e*e*e*(e*(e*6-15)+10);
function camFor(p){return Z0+(ZE-Z0)*smoother(cl(p/J.hero,0,1))}   // slow start, slow arrival
function ui(r,p){
  const ho=cl((cur-2.35)/.6,0,1);
  heroCopy.style.opacity=ho;heroCopy.style.transform=`translateY(${(1-ho)*-40}px)`;heroCopy.style.visibility=ho<.01?'hidden':'visible';
  // the sign fades out while the shop scene fades in underneath: one continuous move, no flash
  canvas.style.opacity=(1-smoother(cl((p/J.hero-.55)/.45,0,1))).toFixed(3);
  dock.classList.toggle('show',-r.top>innerHeight*.55);
  hdr.classList.toggle('solid',r.bottom<innerHeight*.2);
}
function tick(){
  raf=0;if(!visible)return;
  const r=journey.getBoundingClientRect(),p=cl(-r.top/(r.height-innerHeight),0,1),target=camFor(p);
  vel=target-cur;const moving=vel!==0;cur+=vel*.14;if(Math.abs(vel)<.0004){cur=target;vel=0}
  if(moving||dirty){draw();ui(r,p);dirty=false}
  raf=requestAnimationFrame(tick);
}
const jio=new IntersectionObserver(([e])=>{
  visible=e.isIntersecting;
  if(visible){if(!raf)raf=requestAnimationFrame(tick)}else{dock.classList.add('show');hdr.classList.add('solid')}
});jio.observe(journey);
new ResizeObserver(layout).observe(canvas);
// GPU reset on phones: drop to the static layout instead of a blank stage
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();jio.disconnect();cancelAnimationFrame(raf);raf=0;visible=false;hero=null;heroCopy.removeAttribute('style');root.classList.remove('gl','gl-ready');plainChrome()},{once:true});

// The hero photo comes from the markup (srcset picks the phone-sized file on small screens; data-wide is optional for landscape).
// Safety net: if the 3D hero is not up within 7 s, drop to the plain photo instead of leaving a dark screen.
const heroEl=$('.hero-img'),wideScreen=innerWidth/innerHeight>1.15;
let gaveUp=false;
const giveUp=()=>{if(gaveUp)return;gaveUp=true;jio.disconnect();cancelAnimationFrame(raf);raf=0;visible=false;hero=null;root.classList.remove('gl','gl-ready');heroCopy.removeAttribute('style');plainChrome()};
window.DARTA.heroOff=giveUp;   // the shop scene calls this if its own 3D fails, so the page falls back to the plain layout as a whole
setTimeout(()=>{if(!root.classList.contains('gl-ready')&&!gaveUp)giveUp()},7000);
const heroReady=heroEl.complete?Promise.resolve():new Promise(r=>{heroEl.addEventListener('load',r,{once:true});heroEl.addEventListener('error',r,{once:true})});
heroReady.then(()=>tex((wideScreen&&heroEl.dataset.wide)||heroEl.currentSrc||heroEl.getAttribute('src'))).then(h=>{
  if(gaveUp)return;
  hero={t:h.t,a:h.a,x:0,y:0,z:0};layout();
  root.classList.add('gl-ready');if(!raf)raf=requestAnimationFrame(tick);
}).catch(()=>{if(!gaveUp)giveUp()});
})();
