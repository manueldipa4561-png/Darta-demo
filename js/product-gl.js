/* Darta product renderer.
   Raw WebGL1, no library: lathe-built jars and bottles, a rounded-card extrusion,
   procedural studio lighting (key softbox, strip light, teal rim) and canvas-drawn labels.
   Poses (unscrew, tilt, pour) are pure functions of a 0..1 progress value, so a scroll bar can scrub them both ways.
   createGL() makes an independent renderer: D.GL serves the shelf and the product viewer, the scroll film makes its own. */
(()=>{
'use strict';
const D=window.DARTA=window.DARTA||{};
const TAU=Math.PI*2, cl=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------- math (column-major) ---------- */
const v3={
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]}
};
const m4={
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o},
  persp(f,a,n,fa){const t=1/Math.tan(f/2),nf=1/(n-fa);return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(fa+n)*nf,-1,0,0,2*fa*n*nf,0])},
  look(e,t,u){const z=v3.norm(v3.sub(e,t)),x=v3.norm(v3.cross(u,z)),y=v3.cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-v3.dot(x,e),-v3.dot(y,e),-v3.dot(z,e),1])},
  T:(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]),
  S:s=>new Float32Array([s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1]),
  Rx(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])},
  Ry(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])},
  Rz(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1])}
};
const hex=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16)/255)};

/* ---------- geometry ---------- */
// Surface of revolution. profile = [[radius,y],...] bottom to top. Repeated points make a hard crease.
function lathe(profile,seg=72){
  const n=profile.length,ys=profile.map(p=>p[1]),y0=Math.min(...ys),y1=Math.max(...ys),dy=(y1-y0)||1;
  const segN=i=>{ // unit outward normal (r,y) of segment i -> i+1, or null when zero length
    const a=profile[i],b=profile[i+1],dr=b[0]-a[0],dyy=b[1]-a[1],l=Math.hypot(dr,dyy);
    return l<1e-6?null:[dyy/l,-dr/l];
  };
  const nrm=profile.map((_,i)=>{
    const a=i>0?segN(i-1):null,b=i<n-1?segN(i):null;
    let r=0,y=0;if(a){r+=a[0];y+=a[1]}if(b){r+=b[0];y+=b[1]}
    const l=Math.hypot(r,y)||1;return [r/l,y/l];
  });
  const vtx=[],idx=[];
  for(let i=0;i<n;i++)for(let j=0;j<=seg;j++){
    const th=(j/seg-.5)*TAU,s=Math.sin(th),c=Math.cos(th),[r,y]=profile[i],[nr,ny]=nrm[i];
    vtx.push(r*s,y,r*c, nr*s,ny,nr*c, j/seg,(y-y0)/dy);
  }
  for(let i=0;i<n-1;i++){
    if(segN(i)===null)continue;
    for(let j=0;j<seg;j++){
      const a=i*(seg+1)+j,b=a+1,c=a+seg+1,d=c+1;
      idx.push(a,b,c,b,d,c);
    }
  }
  return {vtx,idx,y0,y1};
}

// Rounded-rectangle slab (gift card): front face, back face and edge as separate meshes.
function slab(w,h,t,r,cs=10){
  const pts=[];
  const corners=[[w/2-r,h/2-r,0],[-w/2+r,h/2-r,1],[-w/2+r,-h/2+r,2],[w/2-r,-h/2+r,3]];
  corners.forEach(([cx,cy,q])=>{for(let i=0;i<=cs;i++){const a=q*Math.PI/2+i/cs*Math.PI/2;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}});
  const face=(z,nz,flip)=>{
    const vtx=[0,0,z,0,0,nz,.5,.5],idx=[];
    pts.forEach(([x,y])=>vtx.push(x,y,z,0,0,nz,flip?.5-x/w:x/w+.5,y/h+.5));
    for(let i=0;i<pts.length;i++){const a=1+i,b=1+(i+1)%pts.length;nz>0?idx.push(0,a,b):idx.push(0,b,a)}
    return {vtx,idx};
  };
  const side={vtx:[],idx:[]};
  pts.forEach(([x,y],i)=>{
    const p=pts[(i+pts.length-1)%pts.length],q=pts[(i+1)%pts.length];
    let nx=q[1]-p[1],ny=-(q[0]-p[0]);const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
    side.vtx.push(x,y,t/2,nx,ny,0,-1,-1, x,y,-t/2,nx,ny,0,-1,-1);
  });
  for(let i=0;i<pts.length;i++){const a=i*2,b=((i+1)%pts.length)*2;side.idx.push(a,a+1,b,b,a+1,b+1)}
  return {front:face(t/2,1,false),back:face(-t/2,-1,true),side};
}

const QUAD={vtx:[-.5,0,-.5,0,1,0,0,0, .5,0,-.5,0,1,0,1,0, .5,0,.5,0,1,0,1,1, -.5,0,.5,0,1,0,0,1],idx:[0,2,1,0,3,2]};

/* ---------- shaders ---------- */
const VS=`attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;
uniform mat4 uVP;uniform mat4 uM;
varying vec3 vW;varying vec3 vN;varying vec2 vU;varying vec3 vL;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=(uM*vec4(aN,0.)).xyz;vU=aU;vL=aP;gl_Position=uVP*w;}`;
const FS=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vW;varying vec3 vN;varying vec2 vU;varying vec3 vL;
uniform vec3 uCam,uBase,uRim;
uniform float uRough,uMetal,uKnurl,uGlass,uLiquid,uHolo,uShadow,uTime,uHasT,uShA,uAmb;
uniform vec4 uDecal;
uniform sampler2D uT;
vec3 studio(vec3 R,float rough){
  float s=mix(.04,.5,rough);
  vec3 c=mix(vec3(.012,.014,.015),vec3(.085,.098,.104),smoothstep(-.2,.9,R.y));
  vec3 k=normalize(vec3(-.55,.62,.56));
  c+=vec3(1.55,1.48,1.38)*smoothstep(.78-s,.93+s*.15,dot(R,k));
  vec3 st=normalize(vec3(.88,.12,.30));
  c+=vec3(.86,.98,1.05)*1.25*smoothstep(.93-s*.7,.988,dot(R,st))*smoothstep(-.8,.0,R.y)*smoothstep(.97,.55,R.y);
  vec3 rm=normalize(vec3(.42,.22,-.88));
  c+=uRim*1.9*smoothstep(.85-s,.97,dot(R,rm));
  vec3 lf=normalize(vec3(-.9,.05,-.35));
  c+=uRim*.55*smoothstep(.9-s,.99,dot(R,lf));
  c+=vec3(.55)*smoothstep(.86-s,1.,R.y)*.55;
  c+=vec3(uAmb)*mix(.55,1.,smoothstep(-.6,.9,R.y));
  return c;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  if(uShadow>.5){float d=length(vU-.5)*2.;float a=smoothstep(1.,.05,d);a*=a*.62*uShA;gl_FragColor=vec4(0.,0.,0.,a);return;}
  vec3 N=normalize(vN),V=normalize(uCam-vW);
  float front=step(0.,dot(N,V));
  if(uKnurl>0.){vec3 T=normalize(vec3(-N.z,0.,N.x));N=normalize(N+T*sin(vU.x*6.28318*uKnurl)*.13*(1.-smoothstep(.04,.16,abs(N.y))));}
  vec3 base=pow(uBase,vec3(2.2));float mask=0.;
  if(uHasT>.5&&vU.x>=0.){
    vec2 uv=vU;float inside=1.;
    if(uHasT<1.5){
      inside=step(uDecal.x,vU.x)*step(vU.x,uDecal.y)*step(uDecal.z,vU.y)*step(vU.y,uDecal.w);
      uv=vec2((vU.x-uDecal.x)/(uDecal.y-uDecal.x),(vU.y-uDecal.z)/(uDecal.w-uDecal.z));
    }
    inside*=front; // decals only on surfaces facing the camera (no mirrored label through glass)
    vec4 t=texture2D(uT,vec2(uv.x,1.-uv.y));
    base=mix(base,pow(t.rgb,vec3(2.2)),t.a*inside);mask=t.a*inside;
  }
  float ndv=max(dot(N,V),0.);
  vec3 R=reflect(-V,N);
  float rough=mix(uRough,.82,mask);
  float metal=mix(uMetal,0.,mask);
  vec3 F0=mix(vec3(.045),base,metal);
  vec3 F=F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-ndv,5.);
  vec3 spec=studio(R,rough)*F;
  if(uHolo>0.){
    float t=vL.x*.8+vL.y*1.15+R.x*1.7+R.y*1.1;
    vec3 rb=.5+.5*cos(6.28318*(t+vec3(0.,.33,.67)));
    spec+=rb*uHolo*(.18+.55*pow(1.-ndv,.6))*(1.-mask*.85);
  }
  if(uGlass>.5){
    float filled=step(vU.y,uLiquid);
    vec3 core=base*(.25+1.35*pow(ndv,1.4))*mix(.55,1.,filled);
    float a=mix(.4,.97,filled)*(.82+.18*(1.-ndv));
    vec3 g=core*a+spec*mix(1.,.8,filled);
    float al=clamp(a+max(max(spec.r,spec.g),spec.b),0.,1.);
    g=aces(g*1.05);
    gl_FragColor=vec4(pow(g,vec3(1./2.2))*al,al);
    return;
  }
  vec3 Ld=normalize(vec3(-.5,.7,.6));
  float dl=max(dot(N,Ld),0.);
  vec3 dif=base*(1.-metal)*(vec3(.075,.085,.09)+dl*vec3(.95,.92,.86)*.78+studio(N,1.)*.22);
  vec3 col=dif+spec+uRim*pow(1.-ndv,3.)*.22;
  col=aces(col*1.05);
  gl_FragColor=vec4(pow(col,vec3(1./2.2)),1.);
}`;

/* powder grains + mist: one soft point sprite per particle, positions computed on the CPU each frame */
const PVS=`attribute vec3 aP;attribute vec4 aA;uniform mat4 uVP;uniform float uScale,uMaxPt;
varying float vA;varying float vS;
void main(){gl_Position=uVP*vec4(aP,1.);gl_PointSize=clamp(aA.x*uScale/gl_Position.w,1.,uMaxPt);vA=aA.y;vS=aA.z;}`;
const PFS=`precision mediump float;varying float vA;varying float vS;uniform vec3 uCol,uShade;uniform float uSoft;
void main(){vec2 c=gl_PointCoord-.5;float d=length(c)*2.;if(d>1.)discard;
float a=smoothstep(1.,uSoft,d)*vA;vec3 col=mix(uCol,uShade,vS*(.3+.7*smoothstep(-.7,.9,c.y*2.-c.x*.8)));
gl_FragColor=vec4(col*a,a);}`;

/* ---------- label textures ---------- */
const LOGO=new Image();let logoP=null;   // the script logo is printed on the Wax Powder bottle
const logoReady=()=>logoP||(logoP=new Promise(r=>{LOGO.onload=LOGO.onerror=()=>r();LOGO.src='img/logo.png'}));
const fontOK=()=>{
  const f=document.fonts&&document.fonts.load?Promise.all([document.fonts.load('800 80px "Barlow Condensed"'),document.fonts.load('italic 800 80px "Barlow Condensed"'),document.fonts.load('500 30px Barlow'),document.fonts.load('600 34px Barlow')]).catch(()=>{}):Promise.resolve();
  return Promise.all([f,logoReady()]).then(()=>{});
};
const MONO='ui-monospace,"SF Mono",Menlo,Consolas,monospace';
function fit(ctx,text,font,maxW,startPx){let px=startPx;do{ctx.font=font.replace('{px}',px);px-=2}while(ctx.measureText(text).width>maxW&&px>16);return px+2}

function drawLabel(p){ // 1024x512, wrapped on jars/bottles
  const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d'),L=p.look||{};
  const ink=L.ink||'#efe9df',acc=L.accent||'#6cc0b8';
  x.fillStyle=L.label||'#0f0f0e';x.fillRect(0,0,1024,512);
  const g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'rgba(255,255,255,.06)');g.addColorStop(1,'rgba(0,0,0,.18)');x.fillStyle=g;x.fillRect(0,0,1024,512);
  x.strokeStyle=acc;x.lineWidth=5;x.strokeRect(26,26,972,460);
  // centred layout: stays readable as the label wraps away from the camera
  x.textBaseline='alphabetic';x.textAlign='center';
  x.fillStyle=acc;x.font='italic 800 112px "Barlow Condensed"';x.fillText('DARTA',512,128);
  x.fillStyle=ink;x.globalAlpha=.62;x.font=`500 24px ${MONO}`;x.fillText('BARBER STUDIO  -  '+(p.label.no||''),512,170);x.globalAlpha=1;
  x.fillStyle=ink;
  const name=(p.label.name||p.name).toUpperCase();
  const px=fit(x,name,'800 {px}px "Barlow Condensed"',640,184);x.font=`800 ${px}px "Barlow Condensed"`;x.fillText(name,512,338);
  x.fillStyle=acc;x.font='600 34px Barlow';x.fillText((p.label.sub||'').toUpperCase(),512,394);
  x.fillStyle=ink;x.globalAlpha=.55;x.fillRect(332,422,360,3);x.globalAlpha=.85;x.font=`500 26px ${MONO}`;x.fillText((p.label.vol||'')+'  -  PESCARA',512,466);x.globalAlpha=1;
  return c;
}
const SERIF='"Bodoni 72","Didot","Bodoni MT","Playfair Display",Georgia,"Times New Roman",serif';
function drawPowderLabel(p){ // 1024x1024, printed straight onto the black bottle: transparent canvas, ink only
  const c=document.createElement('canvas');c.width=1024;c.height=1024;const x=c.getContext('2d'),L=p.look||{};
  x.fillStyle=L.ink||'#f4f1ea';x.textAlign='center';x.textBaseline='alphabetic';
  const px=fit(x,'POWDER','600 {px}px '+SERIF,700,230);x.font=`600 ${px}px ${SERIF}`;
  const y1=48+px*.74;x.fillText('WAX',512,y1);x.fillText('POWDER',512,y1+px*.88);
  if(LOGO.naturalWidth){x.globalAlpha=.96;x.drawImage(LOGO,150,y1+px*.88+30,724,724*LOGO.naturalHeight/LOGO.naturalWidth);x.globalAlpha=1}
  x.textAlign='left';x.font=`700 70px ${SERIF}`;x.fillText((p.label&&p.label.sub)||'Volumizzante',140,930);
  return c;
}
function drawCard(p,side,amount){ // 1024x512, mapped on a 1.58:1 card
  const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d'),L=p.look||{};
  const gift=p.look&&p.look.finish==='gift';
  const grd=x.createLinearGradient(0,0,1024,512);
  if(gift){grd.addColorStop(0,'#2a6b66');grd.addColorStop(.55,'#173e3b');grd.addColorStop(1,'#0c1f1e')}
  else{grd.addColorStop(0,'#232321');grd.addColorStop(.6,'#121211');grd.addColorStop(1,'#090908')}
  x.fillStyle=grd;x.fillRect(0,0,1024,512);
  const acc=L.accent||'#6cc0b8',ink='#efe9df';
  x.textBaseline='alphabetic';
  if(side==='front'){
    x.globalAlpha=.1;x.strokeStyle=ink;x.lineWidth=2;
    for(let i=0;i<9;i++){x.beginPath();x.arc(860,40,70+i*46,0,TAU);x.stroke()}
    x.globalAlpha=1;
    x.fillStyle=acc;x.font='italic 800 132px "Barlow Condensed"';x.fillText('DARTA',60,150);
    x.fillStyle=ink;x.globalAlpha=.65;x.font=`500 26px ${MONO}`;x.fillText('BARBER STUDIO - PESCARA',64,194);x.globalAlpha=1;
    x.fillStyle=ink;
    if(gift){
      const txt=amount?`${amount}€`:'REGALO';
      const px=fit(x,txt,'800 {px}px "Barlow Condensed"',520,250);x.font=`800 ${px}px "Barlow Condensed"`;x.fillText(txt,60,438);
      x.font=`500 26px ${MONO}`;x.textAlign='right';x.globalAlpha=.75;x.fillText('GIFT CARD',962,80);x.fillText('1 TAGLIO, 1 SORRISO',962,454);x.globalAlpha=1;
    }else{
      x.font='800 190px "Barlow Condensed"';const fw=x.measureText('FADE ').width;x.fillText('FADE',60,420);x.fillStyle=acc;x.fillText('CLUB',60+fw,420);
      x.fillStyle=ink;x.font=`500 26px ${MONO}`;x.textAlign='right';x.globalAlpha=.75;x.fillText('2 TAGLI AL MESE',962,80);x.fillText('36€ / MESE',962,454);x.globalAlpha=1;
    }
  }else{
    x.fillStyle='#000';x.globalAlpha=.55;x.fillRect(0,64,1024,92);x.globalAlpha=1;
    x.fillStyle=ink;x.globalAlpha=.8;x.font=`500 26px ${MONO}`;x.fillText(gift?'VALIDA 12 MESI - TUTTI I SERVIZI E PRODOTTI':'ATTIVO DAL PRIMO TAGLIO - DISDICI QUANDO VUOI',64,330);
    x.fillText('VIA PIERO GOBETTI 184 - 65129 PESCARA',64,372);x.globalAlpha=1;
    for(let i=0;i<5;i++){x.beginPath();x.arc(84+i*70,440,24,0,TAU);x.strokeStyle=acc;x.setLineDash([6,6]);x.lineWidth=3;x.stroke()}
    x.setLineDash([]);x.fillStyle=acc;x.font='italic 800 52px "Barlow Condensed"';x.textAlign='right';x.fillText('DARTA',962,462);
  }
  return c;
}

/* ---------- product models ---------- */
const PROF={
  jarBody:[[0,0],[.40,0],[.465,.012],[.495,.045],[.50,.09],[.50,.43],[.49,.455],[0,.455]],
  jarLid:[[0,.45],[.505,.45],[.53,.46],[.535,.475],[.535,.585],[.53,.605],[.50,.62],[.40,.626],[0,.626]],
  bottle:[[0,0],[.24,0],[.30,.02],[.335,.07],[.34,.14],[.34,.55],[.335,.60],[.30,.68],[.20,.74],[.15,.78],[.14,.84],[0,.84]],
  collar:[[0,.80],[.185,.80],[.195,.82],[.195,.96],[.185,.985],[0,.985]],
  bulb:[[0,.98],[.115,.98],[.12,1.02],[.115,1.12],[.095,1.22],[.05,1.30],[0,1.33]],
  spray:[[0,0],[.30,0],[.355,.03],[.37,.08],[.37,.62],[.36,.68],[.30,.76],[.20,.82],[.16,.86],[0,.86]],
  sCollar:[[0,.84],[.19,.84],[.20,.86],[.20,.94],[.19,.96],[0,.96]],
  sStem:[[0,.95],[.07,.95],[.07,1.06],[0,1.06]],
  sHead:[[0,1.05],[.16,1.05],[.17,1.07],[.17,1.16],[.15,1.19],[0,1.19]],
  nozzle:[[0,0],[.045,0],[.045,.2],[0,.2]],
  // Wax Powder, proportions taken from the product film: slim gloss-black bottle, ribbed neck, silver screw cap
  wbBody:[[0,0],[.20,0],[.27,.014],[.30,.06],[.30,.95],[.292,1.0],[.27,1.07],[.22,1.15],[.185,1.21],[.172,1.24],[.172,1.26],
    [.19,1.272],[.20,1.29],[.20,1.305],[.19,1.322],[.172,1.334],[.172,1.35],[.19,1.362],[.20,1.38],[.20,1.395],[.19,1.412],[.172,1.424],[.172,1.44],
    [.19,1.452],[.20,1.47],[.20,1.485],[.19,1.502],[.172,1.514],[.172,1.53],[.19,1.542],[.20,1.56],[.20,1.575],[.185,1.589],[.17,1.592],[.15,1.592],[.15,1.52],[0,1.52]],
  wbPowder:[[.149,1.527],[0,1.527]],
  wbCap:[[0,.40],[.215,.40],[.215,0],[.24,0],[.256,.02],[.262,.05],[.262,.41],[.255,.44],[.235,.46],[0,.46]]
};
const decal=(profKey,r,y0,y1,ar=2)=>{ // label rectangle (width:height = ar), centred on the front
  const pr=PROF[profKey],ys=pr.map(q=>q[1]),mn=Math.min(...ys),mx=Math.max(...ys),half=((y1-y0)*ar/r)/TAU/2;
  return [.5-half,.5+half,(y0-mn)/(mx-mn),(y1-mn)/(mx-mn)];
};
const GEO_DEF={ // name -> builder
  jarBody:()=>lathe(PROF.jarBody),jarLid:()=>lathe(PROF.jarLid),
  bottle:()=>lathe(PROF.bottle),collar:()=>lathe(PROF.collar,56),bulb:()=>lathe(PROF.bulb,56),
  spray:()=>lathe(PROF.spray),sCollar:()=>lathe(PROF.sCollar,56),sStem:()=>lathe(PROF.sStem,32),sHead:()=>lathe(PROF.sHead,56),nozzle:()=>lathe(PROF.nozzle,32),
  wbBody:()=>lathe(PROF.wbBody,96),wbPowder:()=>lathe(PROF.wbPowder,48),wbCap:()=>lathe(PROF.wbCap,96),
  quad:()=>QUAD
};
let SLAB=null;

// returns {parts, radius, ty, shadows}. Each part is one draw call.
function build(p,byId){
  const L=p.look||{},acc=hex(L.accent||'#6cc0b8');
  const part=(o)=>Object.assign({pos:[0,0,0],rot:[0,0,0],s:1,rough:.6,metal:0,col:[.5,.5,.5]},o);
  const rim=acc;
  switch(p.kind){
    case 'jar':return {rim,radius:.76,ty:.33,shadows:[{pos:[0,0,0],size:1.7}],parts:[
      part({g:'jarBody',col:hex(L.body||'#1b1b19'),rough:.58,tex:'lbl',decal:decal('jarBody',.5,.045,.425)}),
      part({g:'jarLid',col:hex(L.lid||'#c9ccca'),rough:L.lidMetal?.5:.55,metal:L.lidMetal?.9:0,knurl:46,role:'cap'})]};
    case 'dropper':return {rim,radius:.92,ty:.64,shadows:[{pos:[0,0,0],size:1.5}],parts:[
      part({g:'bottle',col:hex(L.glass||'#b4570d'),rough:.05,glass:1,liquid:.74,tex:'lbl',decal:decal('bottle',.34,.1,.54)}),
      part({g:'collar',col:hex('#161615'),rough:.38,metal:.85,knurl:36,role:'cap'}),
      part({g:'bulb',col:hex('#0e0e0d'),rough:.55,role:'cap'})]};
    case 'spray':return {rim,radius:.96,ty:.6,shadows:[{pos:[0,0,0],size:1.55}],parts:[
      part({g:'spray',col:hex(L.body||'#2f6f6a'),rough:.42,tex:'lbl',decal:decal('spray',.37,.1,.56)}),
      part({g:'sCollar',col:hex('#cfd2d0'),rough:.3,metal:1,knurl:40,role:'cap'}),
      part({g:'sStem',col:hex('#0e0e0d'),rough:.5,role:'cap'}),
      part({g:'sHead',col:hex('#101010'),rough:.38,role:'cap'}),
      part({g:'nozzle',col:hex('#0b0b0b'),rough:.45,pos:[0,1.115,.12],rot:[Math.PI/2,0,0],role:'cap'})]};
    case 'powder':return {rim,radius:1.0,ty:.84,zoomOpen:.85,tyOpen:.45,shadows:[{pos:[0,0,0],size:1.5}],pose:'powder',parts:[
      part({g:'wbBody',col:hex(L.body||'#0b0b0c'),rough:.1,tex:'lbl',decal:decal('wbBody',.30,.30,.94,1),role:'body'}),
      part({g:'wbPowder',col:[.86,.85,.82],rough:.96,role:'body'}),
      part({g:'wbCap',col:hex(L.cap||'#cfd3d6'),rough:.3,metal:1,amb:.4,pos:[0,1.205,0],role:'cap'})]};
    case 'kit':{
      const out={rim,radius:1.2,ty:.44,shadows:[],parts:[]};
      (p.items||[]).forEach((id,i)=>{
        const q=byId[id];if(!q||q.kind==='kit')return;   // a kit never contains kits (no recursion)
        const sub=build(q,byId),dx=[-.64,.0,.66][i]??0,dz=[.22,-.3,.22][i]??0,sc=[.9,.84,.92][i]??.85;
        sub.parts.forEach(pt=>out.parts.push(Object.assign({},pt,{pos:[pt.pos[0]*sc+dx,pt.pos[1]*sc,pt.pos[2]*sc+dz],s:pt.s*sc,tex:pt.tex?id+':'+pt.tex:undefined,texOf:q})));
        out.shadows.push({pos:[dx,0,dz],size:1.45*sc});
      });
      return out}
    case 'card':{
      const gift=L.finish==='gift';
      return {rim,radius:1.16,ty:.62,pitch:-.08,shadows:[{pos:[0,0,0],size:1.4,alpha:.7}],parts:[
        part({g:'slabF',col:[.5,.5,.5],rough:.2,tex:'front',tf:2,pos:[0,.62,0],holo:gift?.55:.4,rot:[-.1,0,0]}),
        part({g:'slabB',col:[.5,.5,.5],rough:.2,tex:'back',tf:2,pos:[0,.62,0],rot:[-.1,0,0]}),
        part({g:'slabS',col:hex('#8d918f'),rough:.28,metal:1,pos:[0,.62,0],rot:[-.1,0,0]})]};
    }
  }
  return {rim,radius:1,ty:.5,shadows:[],parts:[]};
}

/* ---------- poses: pure functions of progress t (0..1), so scrolling can scrub them in both directions ---------- */
const ss=t=>t*t*(3-2*t),seg=(t,a,b)=>cl((t-a)/(b-a),0,1);
const xf=(M,v)=>[M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12],M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13],M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]];
const xd=(M,v)=>[M[0]*v[0]+M[4]*v[1]+M[8]*v[2],M[1]*v[0]+M[5]*v[1]+M[9]*v[2],M[2]*v[0]+M[6]*v[1]+M[10]*v[2]];
const PW={PIV:.83,CAPC:[0,1.435,0],MOUTH:[0,1.56,0]};
/* Wax Powder: SVITA (cap unscrews and floats off) -> tilt -> SCUOTI (shake, powder pours) -> DAI VOLUME (bottle rights itself, cap screws back on) */
function powderPose(t,time=0){
  const bob=Math.sin(time*1.7)*.02;
  const up=ss(seg(t,.06,.30)),drift=ss(seg(t,.26,.44)),tilt=ss(seg(t,.34,.52)),back=ss(seg(t,.80,.92)),capBack=ss(seg(t,.82,.97));
  const sk=seg(t,.52,.80),shake=Math.sin(sk*TAU*6)*Math.sin(sk*Math.PI)*.11;
  const ta=tilt*(1-back),ang=2.18*ta+shake;
  const ox=.5*ta,oy=.34*ta+bob*(1-ta);
  const body=m4.mul(m4.T(ox,oy,0),m4.mul(m4.T(0,PW.PIV,0),m4.mul(m4.Rz(ang),m4.T(0,-PW.PIV,0))));
  const qa=up*(1-capBack),qd=drift*(1-capBack),C=PW.CAPC;
  const spin=-TAU*3*qa,lift=.9*qa,tum=Math.sin(time*.9)*.25*qd;
  const cap=m4.mul(m4.T(.95*qd,lift+.35*qd+bob*(1-qa),.25*qd),m4.mul(m4.T(C[0],C[1],C[2]),m4.mul(m4.Rz(-.55*qd),m4.mul(m4.Rx(.5*qd+tum),m4.mul(m4.Ry(spin),m4.T(-C[0],-C[1],-C[2]))))));
  return {body,cap,mouth:{p:xf(body,PW.MOUTH),d:xd(body,[0,1,0])},
    zoom:ss(seg(t,.05,.26))*(1-ss(seg(t,.88,.99))),
    shadow:{x:ox*.9,size:1.5+.5*ta-.3*Math.max(0,oy),a:Math.max(.3,.85-.9*Math.max(0,oy))}};
}
function genericPose(t,time=0){ // jars, dropper, spray: the lid or head unscrews, floats up and comes back
  const open=ss(seg(t,.12,.42))*(1-ss(seg(t,.62,.92))),bob=Math.sin(time*1.7)*.02;
  return {body:m4.T(0,bob,0),cap:m4.mul(m4.T(0,bob+.85*open,0),m4.Ry(-TAU*2*open)),mouth:null,zoom:0,shadow:null};
}
const POSES={powder:powderPose};

/* ---------- powder: stateless particle field (position = f(age)), so it scrubs like everything else ---------- */
const FX={N:5200,M:110,T:9,E0:.5,E1:.8,K:1.5,G:.95,FLOOR:-1.55,ready:false};
const hash=(i,k)=>{const x=Math.sin(i*127.1+k*311.7)*43758.5453;return x-Math.floor(x)};
function fxInit(){
  if(FX.ready)return;FX.ready=true;
  const n=FX.N+FX.M;
  FX.o=new Float32Array(n*3);FX.v=new Float32Array(n*3);FX.te=new Float32Array(n);FX.life=new Float32Array(n);FX.sz=new Float32Array(n);FX.sh=new Float32Array(n);FX.fy=new Float32Array(n);
  for(let i=0;i<n;i++){
    const mist=i<FX.M;
    const te=FX.E0+(FX.E1-FX.E0)*Math.pow(hash(i,1),.85);
    const m=powderPose(te).mouth,sp=mist?.62:.46,ang=hash(i,2)*TAU,rr=Math.sqrt(hash(i,3))*sp;
    const ux=-m.d[1],uy=m.d[0];
    const speed=(mist?.6:.9)+Math.pow(hash(i,4),1.5)*(mist?1.2:2.8);
    FX.o.set([m.p[0],m.p[1],m.p[2]],i*3);
    FX.v.set([(m.d[0]+ux*Math.cos(ang)*rr)*speed,(m.d[1]+uy*Math.cos(ang)*rr)*speed,Math.sin(ang)*rr*speed],i*3);
    FX.te[i]=te;FX.life[i]=(mist?3.6:2.6)+hash(i,5)*1.2;
    FX.sz[i]=mist?.6+hash(i,6)*.7:.016+hash(i,6)*.034;FX.sh[i]=hash(i,7);FX.fy[i]=hash(i,8)*.28;
  }
}
// fills out (7 floats per live point: x y z size alpha shade pad); mist first, then grains. Returns [mistCount, grainCount]
function fxFill(t,out){
  fxInit();
  const {N,M,T,K,G,FLOOR}=FX,fade=1-seg(t,.88,.98);let k=0,nm=0;
  for(let i=0;i<N+M;i++){
    const age=(t-FX.te[i])*T;
    if(age<=0||fade<=0||age>FX.life[i])continue;
    const mist=i<M,e=1-Math.exp(-K*age),f=(age-e/K)*G/K,w=Math.sin(age*3+FX.sh[i]*6)*.015*e;
    let y=FX.o[i*3+1]+FX.v[i*3+1]*e/K-f;const fl=FLOOR+FX.fy[i];
    const settled=y<fl;if(settled)y=fl;
    const life=FX.life[i],a=Math.min(1,age/.12)*(1-seg(age,life*.62,life))*fade*(settled?.9:1);
    out[k++]=FX.o[i*3]+FX.v[i*3]*e/K+w;out[k++]=y;out[k++]=FX.o[i*3+2]+FX.v[i*3+2]*e/K;
    out[k++]=mist?FX.sz[i]*(1+age*.5):FX.sz[i];out[k++]=mist?a*.15:a*.95;out[k++]=FX.sh[i];out[k++]=0;
    if(mist)nm++;
  }
  return [nm,k/7-nm];
}

/* ---------- renderer ---------- */
const nul=()=>Object.create(null);
function createGL(hooks={}){
const R={gl:null,canvas:null,prog:null,pp:null,U:{},A:{},PU:{},geo:nul(),tex:nul(),specs:nul(),dead:false,aniso:null,pbuf:null,parr:new Float32Array(7*(FX.N+FX.M))};
let catalogById=nul();

function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function link(gl,vs,fs,attrs){
  const pr=gl.createProgram();gl.attachShader(pr,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(pr,compile(gl,gl.FRAGMENT_SHADER,fs));
  attrs.forEach((a,i)=>gl.bindAttribLocation(pr,i,a));   // fixed slots so both programs can share the enabled arrays
  gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));return pr;
}
function init(){
  if(R.gl&&!R.dead)return true;
  try{
    if(!R.canvas){R.canvas=document.createElement('canvas')}
    const gl=R.canvas.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!gl)return false;
    const pr=link(gl,VS,FS,['aP','aN','aU']),pp=link(gl,PVS,PFS,['aP','aA']);
    gl.useProgram(pr);R.gl=gl;R.prog=pr;R.pp=pp;R.geo=nul();R.tex=nul();R.specs=nul();R.dead=false;
    ['uVP','uM','uCam','uBase','uRim','uRough','uMetal','uKnurl','uGlass','uLiquid','uHolo','uShadow','uShA','uAmb','uTime','uHasT','uDecal','uT'].forEach(k=>R.U[k]=gl.getUniformLocation(pr,k));
    ['uVP','uScale','uMaxPt','uCol','uShade','uSoft'].forEach(k=>R.PU[k]=gl.getUniformLocation(pp,k));
    R.pbuf=gl.createBuffer();R.maxPt=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]||64;
    ['aP','aN','aU'].forEach((k,i)=>{R.A[k]=i;gl.enableVertexAttribArray(i)});
    gl.uniform1i(R.U.uT,0);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    R.aniso=gl.getExtension('EXT_texture_filter_anisotropic');
    if(!R.bound){R.bound=true;
      R.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();R.dead=true;Viewer.stop();hooks.onLost&&hooks.onLost()});
      R.canvas.addEventListener('webglcontextrestored',()=>{if(init()&&hooks.onRestored)hooks.onRestored()});
    }
    return true;
  }catch(e){console.warn('Darta GL unavailable',e);R.gl=null;return false}
}
function geo(name){
  const gl=R.gl;if(R.geo[name])return R.geo[name];
  let def;
  if(name==='quad')def=QUAD;
  else if(name.startsWith('slab')){SLAB=SLAB||slab(1.58,1,.035,.085);def=name==='slabF'?SLAB.front:name==='slabB'?SLAB.back:SLAB.side}
  else def=GEO_DEF[name]();
  const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(def.vtx),gl.STATIC_DRAW);
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(def.idx),gl.STATIC_DRAW);
  return R.geo[name]={vb,ib,n:def.idx.length};
}
function texFor(key,make){
  if(R.tex[key])return R.tex[key];
  const gl=R.gl,c=make(),t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
  if(R.aniso)gl.texParameterf(gl.TEXTURE_2D,R.aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(R.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return R.tex[key]=t;
}
function partTex(pt,p,amount){
  if(!pt.tex)return null;
  const q=pt.texOf||p;
  if(q.kind==='card'){return texFor(`${q.id}:${amount||0}:${pt.tex}`,()=>drawCard(q,pt.tex,amount))}
  return texFor(`${q.id}:lbl`,()=>q.kind==='powder'?drawPowderLabel(q):drawLabel(q));
}
function specFor(p){
  const key=p.id;
  return R.specs[key]||(R.specs[key]=build(p,catalogById));
}

function setSize(w,h){const c=R.canvas;if(c.width!==w||c.height!==h){c.width=w;c.height=h}}
function bindGeo(g){
  const gl=R.gl;gl.bindBuffer(gl.ARRAY_BUFFER,g.vb);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib);
  gl.vertexAttribPointer(R.A.aP,3,gl.FLOAT,false,32,0);gl.vertexAttribPointer(R.A.aN,3,gl.FLOAT,false,32,12);gl.vertexAttribPointer(R.A.aU,2,gl.FLOAT,false,32,24);
}
const TINT={light:{col:[.98,.98,.97],shade:[.4,.44,.49]},dark:{col:[.96,.95,.92],shade:[.66,.68,.68]}};
function drawFx(fx,VP,fov){
  const gl=R.gl,P=R.PU,arr=R.parr,[nm,ng]=fxFill(fx.t,arr),tint=TINT[fx.tint]||TINT.light;
  if(nm+ng<=0)return;
  gl.useProgram(R.pp);
  gl.bindBuffer(gl.ARRAY_BUFFER,R.pbuf);gl.bufferData(gl.ARRAY_BUFFER,arr.subarray(0,(nm+ng)*7),gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(1,4,gl.FLOAT,false,28,12);
  gl.uniformMatrix4fv(P.uVP,false,VP);gl.uniform1f(P.uScale,R.canvas.height/(2*Math.tan(fov/2)));gl.uniform1f(P.uMaxPt,R.maxPt);
  gl.uniform3fv(P.uCol,tint.col);gl.uniform3fv(P.uShade,tint.shade);
  gl.depthMask(false);
  if(nm){gl.uniform1f(P.uSoft,0);gl.drawArrays(gl.POINTS,0,nm)}
  if(ng){gl.uniform1f(P.uSoft,.55);gl.drawArrays(gl.POINTS,nm,ng)}
  gl.depthMask(true);gl.useProgram(R.prog);
}
// opts: yaw, pitch, amount (gift card), time (s, drives the idle float), pose {t}, fx {t,tint}, cam {dist,ty} (overrides the fitted camera)
function frame(p,{yaw=0,pitch=.2,amount=0,time=0,pose=null,fx=null,cam=null}={}){
  const gl=R.gl,spec=specFor(p),w=R.canvas.width,h=R.canvas.height,U=R.U;
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const P=pose?(POSES[spec.pose]||genericPose)(pose.t,time):null;
  const asp=w/h,fov=.5,fitD=spec.radius/Math.sin(fov/2)/Math.min(1,asp);
  const zo=cam&&cam.zo!=null?cam.zo:(spec.zoomOpen||0),dist=(cam&&cam.dist!=null?cam.dist:fitD)*(1+(P?P.zoom:0)*zo),ty=(cam&&cam.ty!=null?cam.ty:spec.ty)+(P?P.zoom:0)*(spec.tyOpen||0);
  const pt=pitch+(spec.pitch||0);
  const eye=[0,ty+Math.sin(pt)*dist,Math.cos(pt)*dist];
  const VP=m4.mul(m4.persp(fov,asp,.1,80),m4.look(eye,[0,ty,0],[0,1,0]));
  gl.useProgram(R.prog);
  gl.uniformMatrix4fv(U.uVP,false,VP);gl.uniform3fv(U.uCam,eye);gl.uniform3fv(U.uRim,spec.rim);gl.uniform1f(U.uTime,time);
  // floor shadows (no depth write; objects draw over them)
  gl.depthMask(false);gl.uniform1f(U.uShadow,1);gl.uniform1f(U.uHasT,0);
  bindGeo(geo('quad'));
  const sh=P&&P.shadow?[{pos:[P.shadow.x,0,0],size:P.shadow.size,a:P.shadow.a}]:spec.shadows;
  sh.forEach(s=>{
    gl.uniform1f(U.uShA,s.a==null?1:s.a);
    gl.uniformMatrix4fv(U.uM,false,m4.mul(m4.Ry(yaw),m4.mul(m4.T(s.pos[0],.003,s.pos[2]),m4.S(s.size))));
    gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);
  });
  gl.uniform1f(U.uShA,1);gl.depthMask(true);gl.uniform1f(U.uShadow,0);
  const draw=pt=>{
    const g=geo(pt.g);bindGeo(g);
    const rm=m4.mul(m4.Ry(pt.rot[1]),m4.mul(m4.Rx(pt.rot[0]),m4.Rz(pt.rot[2])));
    let M=m4.mul(m4.T(pt.pos[0],pt.pos[1],pt.pos[2]),m4.mul(rm,m4.S(pt.s)));
    if(P)M=m4.mul(pt.role==='cap'?P.cap:P.body,M);       // animated groups move as one piece
    M=m4.mul(m4.Ry(yaw),M);
    gl.uniformMatrix4fv(U.uM,false,M);
    gl.uniform3fv(U.uBase,pt.col);gl.uniform1f(U.uRough,pt.rough);gl.uniform1f(U.uMetal,pt.metal);
    gl.uniform1f(U.uAmb,pt.amb||0);gl.uniform1f(U.uKnurl,pt.knurl||0);gl.uniform1f(U.uGlass,pt.glass?1:0);gl.uniform1f(U.uLiquid,pt.liquid||0);gl.uniform1f(U.uHolo,pt.holo||0);
    const t=partTex(pt,p,amount);
    if(t){gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1f(U.uHasT,pt.tf||1);const d=pt.decal||[0,1,0,1];gl.uniform4fv(U.uDecal,d)}
    else gl.uniform1f(U.uHasT,0);
    gl.drawElements(gl.TRIANGLES,g.n,gl.UNSIGNED_SHORT,0);
  };
  spec.parts.filter(q=>!q.glass).forEach(draw);
  gl.depthMask(false);spec.parts.filter(q=>q.glass).forEach(draw);gl.depthMask(true);
  if(fx&&P&&P.mouth){ // the powder is drawn in the world frame, yawed with the product
    drawFx(fx,m4.mul(VP,m4.Ry(yaw)),fov);
  }
}

/* ---------- public: snapshots ---------- */
function setCatalog(list){catalogById=nul();list.forEach(p=>{catalogById[p.id]=p});R.specs=nul()}
async function snapshot(p,opts={}){
  if(!init())return null;
  await fontOK();
  const size=opts.size||560;
  setSize(size,size);
  frame(p,{yaw:opts.yaw??-.34,pitch:opts.pitch??.2,amount:opts.amount,pose:opts.pose||null,fx:opts.fx||null});
  let url=null;
  try{url=R.canvas.toDataURL('image/webp',.92)}catch(e){/* tainted or lost canvas: caller shows the fallback */}
  if(Viewer.p)Viewer.size(); // a live viewer shares this canvas: restore its size
  return url;
}

/* ---------- public: live viewer ---------- */
const Viewer={
  p:null,host:null,yaw:-.5,pitch:.2,vy:0,vp:0,drag:null,raf:0,idleAt:0,amount:0,ro:null,anim:null,onPlay:null,
  async start(host,p,opts={}){
    if(!init())return false;
    await fontOK();
    this.stop();
    this.p=p;this.host=host;this.amount=opts.amount||0;this.yaw=opts.yaw??-.5;this.pitch=.2;this.vy=0;this.vp=0;this.idleAt=performance.now();this.anim=null;
    const c=R.canvas;
    c.className='pv-canvas';c.setAttribute('role','img');c.setAttribute('tabindex','0');
    c.setAttribute('aria-label',`Visualizzatore 3D: ${p.name}. Trascina o usa le frecce per ruotare.`);
    host.appendChild(c);this.size();
    this.ro=new ResizeObserver(()=>this.size());this.ro.observe(host);
    this.bind();
    this.reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.loop();return true;
  },
  size(){
    if(!this.host)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.round(this.host.clientWidth*dpr)),h=Math.max(2,Math.round(this.host.clientHeight*dpr));
    setSize(w,h);this.dirty=true;
  },
  bind(){
    const c=R.canvas;
    this.h={
      down:e=>{this.drag={x:e.clientX,y:e.clientY,id:e.pointerId};this.vy=0;this.vp=0;c.setPointerCapture(e.pointerId);this.idleAt=performance.now();this.host.classList.add('touched');c.classList.add('grab')},
      move:e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;
        this.yaw+=dx*.011;this.pitch=cl(this.pitch+dy*.006,-.05,.62);this.vy=dx*.011;this.vp=0;this.idleAt=performance.now();this.dirty=true},
      up:()=>{this.drag=null;c.classList.remove('grab')},
      key:e=>{const k=e.key;if(k==='ArrowLeft'||k==='ArrowRight'){this.yaw+=(k==='ArrowLeft'?-1:1)*.22;this.idleAt=performance.now();this.dirty=true;e.preventDefault()}
        if(k==='ArrowUp'||k==='ArrowDown'){this.pitch=cl(this.pitch+(k==='ArrowUp'?-1:1)*.08,-.05,.62);this.dirty=true;e.preventDefault()}},
      dbl:()=>{this.yaw=-.5;this.pitch=.2;this.vy=0;this.dirty=true}
    };
    c.addEventListener('pointerdown',this.h.down);c.addEventListener('pointermove',this.h.move);c.addEventListener('pointerup',this.h.up);c.addEventListener('pointercancel',this.h.up);
    c.addEventListener('keydown',this.h.key);c.addEventListener('dblclick',this.h.dbl);
  },
  loop(){
    this.raf=requestAnimationFrame(t=>{
      if(!this.p||R.dead)return;
      let pose=null,fx=null;
      if(this.anim){ // the product's own animation: lid unscrews / powder pours (same timeline as the scroll film)
        const e=(t-this.anim.t0)/this.anim.dur;
        if(e>=1){this.anim=null;this.idleAt=t;this.dirty=true;this.onPlay&&this.onPlay(false)}
        else{pose={t:e};fx={t:e,tint:'dark'};this.dirty=true;this.idleAt=t}
      }
      if(!this.drag&&!pose){
        if(Math.abs(this.vy)>.0004){this.yaw+=this.vy;this.vy*=.94;this.dirty=true}
        else if(!this.reduce&&t-this.idleAt>2200&&t-this.idleAt<16000){this.yaw+=.0045;this.dirty=true}   // gentle turntable for a while, then rest (battery)
      }
      if(this.dirty){frame(this.p,{yaw:this.yaw,pitch:this.pitch,amount:this.amount,time:t/1000,pose,fx});this.dirty=false}
      this.loop();
    });
  },
  canPlay(){return !!this.p&&specFor(this.p).parts.some(q=>q.role==='cap')},
  play(){
    if(!this.canPlay()||this.anim||this.reduce)return false;
    const long=specFor(this.p).pose==='powder';
    this.yaw=long?-.12:this.yaw;this.vy=0;this.anim={t0:performance.now(),dur:long?9500:4200};this.dirty=true;this.onPlay&&this.onPlay(true);return true;
  },
  setAmount(a){this.amount=a;this.dirty=true},
  nudge(d){this.yaw+=d;this.vy=0;this.idleAt=performance.now();this.dirty=true},
  refresh(){this.dirty=true},
  stop(){
    cancelAnimationFrame(this.raf);this.raf=0;
    if(this.anim){this.anim=null;this.onPlay&&this.onPlay(false)}
    if(this.ro){this.ro.disconnect();this.ro=null}
    const c=R.canvas;
    if(c&&this.h){c.removeEventListener('pointerdown',this.h.down);c.removeEventListener('pointermove',this.h.move);c.removeEventListener('pointerup',this.h.up);c.removeEventListener('pointercancel',this.h.up);c.removeEventListener('keydown',this.h.key);c.removeEventListener('dblclick',this.h.dbl);this.h=null}
    if(c&&c.parentNode)c.parentNode.removeChild(c);
    this.p=null;this.host=null;this.drag=null;
  }
};

let SUP=null; // probing creates a context: do it once, contexts are a scarce page-wide resource
return {init,setCatalog,snapshot,viewer:Viewer,frame,specFor,canvas:()=>R.canvas,setSize,dead:()=>R.dead,
  supported:()=>{if(SUP===null){try{const g=document.createElement('canvas').getContext('webgl');SUP=!!g;const l=g&&g.getExtension('WEBGL_lose_context');if(l)l.loseContext()}catch(e){SUP=false}}return SUP},   // supported(): probe once, then release the probe context
  fontsReady:fontOK};
}

D.makeGL=createGL;
D.GL=createGL({onLost:()=>{D.onGLLost&&D.onGLLost()},onRestored:()=>{D.onGLRestored&&D.onGLRestored()}});
})();
