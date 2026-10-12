/* Darta product effects: the motion graphics that play with each product's own animation (powder cloud, mist, oil drops, cream curl,
   pomade glints and scent). Every effect is a stateless function of the animation progress t (0..1), like the poses, so it scrubs both
   ways. build(poses) returns {kind: fn(t, P, out, q) -> layers}: fn appends points (x y z size alpha shade pad = 7 floats) to `out`
   and returns the layers in the same order, [{n, soft, col, shade, add}], which product-gl.js draws as point sprites.
   P is the pose result: P.mouth {p, d} is where the product lets something out and which way. q < 1 (phones) thins the powder. */
(()=>{
'use strict';
const D=window.DARTA=window.DARTA||{};
const TAU=Math.PI*2,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),seg=(t,a,b)=>cl((t-a)/(b-a),0,1),ss=t=>t*t*(3-2*t);
const hash=(i,k)=>{const x=Math.sin(i*127.1+k*311.7)*43758.5453;return x-Math.floor(x)};
const bell=(t,a,b)=>ss(seg(t,a,(a+b)/2))*(1-ss(seg(t,(a+b)/2,b)));         // 0 -> 1 -> 0 between a and b
const put=(out,k,x,y,z,size,alpha,shade)=>{out[k]=x;out[k+1]=y;out[k+2]=z;out[k+3]=size;out[k+4]=alpha;out[k+5]=shade;out[k+6]=0;return k+7};
const MAX=5400;                                                            // the biggest effect (the powder) sizes the shared point buffer
const C={ // colours: col is the lit side, shade the side turned away (the particle shader mixes them)
  clay:{col:[.97,.94,.89],shade:[.58,.54,.48]},dust:{col:[.93,.90,.85],shade:[.52,.50,.47]},
  aloe:{col:[.86,.97,.91],shade:[.45,.55,.50]},droplet:{col:[.95,1,.97],shade:[.55,.65,.62]},
  oil:{col:[1,.70,.22],shade:[.55,.26,.04]},coco:{col:[.98,.96,.90],shade:[.55,.50,.45]},
  scent:{col:[.96,.90,.82],shade:[.55,.50,.45]},glint:{col:[1,.94,.82],shade:[1,.94,.82]},cream:{col:[.99,.97,.94],shade:[.50,.52,.56]}
};
const layer=(n,soft,c,add)=>({n,soft,col:c.col,shade:c.shade,add:!!add});

/* Hair Powder Clay: the shake releases powder in a burst at every turn of the bottle (11 half-swings), a soft cloud billows up behind the
   grains and slowly settles. Every grain starts at the bottle mouth as it was at that moment of the pose. */
function powder(poses){
  const BURSTS=11,SK0=.52,SK1=.80,M=130,N=MAX-M,G=.95,K=1.5,T=9,FLOOR=-1.55,n=N+M;
  const o=new Float32Array(n*3),v=new Float32Array(n*3),te=new Float32Array(n),life=new Float32Array(n),sz=new Float32Array(n),sh=new Float32Array(n),fy=new Float32Array(n),pw=new Float32Array(n);
  for(let i=0;i<n;i++){
    const cloud=i<M,b=1+Math.floor(hash(i,9)*BURSTS);
    pw[i]=cloud?1:Math.sin(Math.PI*b/(BURSTS+1));                          // the middle swings are the strongest
    te[i]=cloud?SK0+.02+(SK1-SK0)*Math.pow(hash(i,1),.9):SK0+(SK1-SK0)*b/(BURSTS+1)+hash(i,1)*.012;
    const m=poses.powder(te[i]).mouth,spread=cloud?.62:.46,ang=hash(i,2)*TAU,rr=Math.sqrt(hash(i,3))*spread;
    const ux=-m.d[1],uy=m.d[0],speed=((cloud?.6:.9)+Math.pow(hash(i,4),1.5)*(cloud?1.2:2.8))*(cloud?1:.55+.7*pw[i]);
    o.set(m.p,i*3);
    v.set([(m.d[0]+ux*Math.cos(ang)*rr)*speed,(m.d[1]+uy*Math.cos(ang)*rr)*speed,Math.sin(ang)*rr*speed],i*3);
    life[i]=(cloud?3.8:2.6)+hash(i,5)*1.2;sz[i]=cloud?.34+hash(i,6)*.5:.016+hash(i,6)*.034;sh[i]=hash(i,7);fy[i]=hash(i,8)*.28;
  }
  return (t,P,out,q=1)=>{
    const fade=1-seg(t,.88,.98),lim=M+Math.floor(N*q);let k=0,nc=0;
    for(let i=0;i<lim;i++){
      const age=(t-te[i])*T;
      if(age<=0||fade<=0||age>life[i])continue;
      const cloud=i<M,e=1-Math.exp(-K*age),f=(age-e/K)*G/K,w=Math.sin(age*3+sh[i]*6)*(cloud?.05:.015)*e;
      let y=o[i*3+1]+v[i*3+1]*e/K-f+(cloud?age*.12:0);const fl=FLOOR+fy[i],settled=!cloud&&y<fl;
      if(settled)y=fl;
      const a=Math.min(1,age/.12)*(1-seg(age,life[i]*.62,life[i]))*fade*(settled?.9:1);
      k=put(out,k,o[i*3]+v[i*3]*e/K+w,y,o[i*3+2]+v[i*3+2]*e/K,cloud?sz[i]*(1+age*.75):sz[i],cloud?a*.065:a*(.55+.4*pw[i]),sh[i]);
      if(cloud)nc++;
    }
    return [layer(nc,0,C.dust),layer(k/7-nc,.55,C.clay)];
  };
}

/* A puff of mist from a nozzle: soft clouds that spread and fade, plus quick crisp droplets.
   cfg: win = the [start, end] of each press, N clouds, nFine droplets, alpha of the clouds, mist / fine colours. */
function spray(cfg){
  const empty=()=>[layer(0,0,cfg.mist),layer(0,.2,cfg.fine)];
  return (t,P,out,q=1)=>{
    const m=P.mouth,fade=1-seg(t,.9,.99);let k=0,n1=0;
    if(!m||fade<=0)return empty();
    for(let i=0;i<cfg.N*q;i++){                                              // soft clouds
      const w=cfg.win[i%cfg.win.length],age=(t-(w[0]+(w[1]-w[0])*hash(i,21)))*7;
      if(age<=0||age>2.4)continue;
      const e=(1-Math.exp(-2.2*age))/2.2,sp=1.6+hash(i,22)*2;
      k=put(out,k,m.p[0]+(m.d[0]+(hash(i,23)-.5)*.5)*sp*e,m.p[1]+(m.d[1]+(hash(i,24)-.5)*.3)*sp*e+age*.05,m.p[2]+(m.d[2]+(hash(i,25)-.5)*.5)*sp*e,
        .09+age*.34,Math.min(1,age/.1)*(1-seg(age,1.2,2.4))*fade*cfg.alpha,hash(i,26));n1++;
    }
    for(let i=0;i<cfg.nFine*q;i++){                                        // fine droplets, faster and shorter lived
      const w=cfg.win[i%cfg.win.length],age=(t-(w[0]+(w[1]-w[0])*.8*hash(i,31)))*7;
      if(age<=0||age>1.5)continue;
      const e=(1-Math.exp(-3*age))/3,sp=2+hash(i,32)*2.2;
      k=put(out,k,m.p[0]+(m.d[0]+(hash(i,33)-.5)*.42)*sp*e,m.p[1]+(m.d[1]+(hash(i,34)-.5)*.3)*sp*e-age*age*.12,m.p[2]+(m.d[2]+(hash(i,35)-.5)*.42)*sp*e,
        .012+hash(i,36)*.012,Math.min(1,age/.05)*(1-seg(age,.7,1.5))*fade*.55,hash(i,37));
    }
    return [layer(n1,0,cfg.mist),layer(k/7-n1,.2,cfg.fine)];
  };
}

/* Beard Oil: the pump pushes out three drops: each swells at the pump head, lets go and falls from rest under gravity, then rings out on the
   counter. Plus a haze of fine oil and an amber glow behind the bottle. */
function oil(){
  const FLOOR=.02,GRAV=2.8,T=7,FORM=.05;                                  // FORM: how long (in t) a drop swells before it lets go
  return (t,P,out,q=1)=>{
    const m=P.mouth,fade=1-seg(t,.9,.99);let k=0,nh=0,nm=0,nd=0,rings=0;
    if(!m)return [layer(0,0,C.oil,true),layer(0,.3,C.oil),layer(0,.15,C.oil),layer(0,.5,C.oil)];
    const glow=bell(t,.30,.80);                                             // halo behind the bottle
    if(glow>0){k=put(out,k,0,1.1,-.7,2.6,.13*glow,0);nh=1}
    for(let i=0;i<90*q;i++){                                                // fine mist: the pump atomises a little as it pushes
      const age=(t-(.45+.05*hash(i,41)))*T;
      if(age<=0||age>1.6)continue;
      const e=(1-Math.exp(-3*age))/3,sp=.6+hash(i,42)*1.5;
      k=put(out,k,m.p[0]+(m.d[0]+(hash(i,43)-.5)*.9)*sp*e,m.p[1]+(m.d[1]+(hash(i,44)-.5)*.6)*sp*e-age*age*.25,m.p[2]+(m.d[2]+(hash(i,45)-.5)*.9)*sp*e,
        .06+hash(i,46)*.07,Math.min(1,age/.08)*(1-seg(age,.8,1.6))*fade*.5,hash(i,47));nm++;
    }
    const ringAt=[];                                                        // rings are drawn after the drops (own layer)
    for(let d=0;d<3;d++){
      const tr=.47+.045*d,age=(t-tr)*T,x0=m.p[0]+.04*d,z0=m.p[2]+.03*d;
      if(fade<=0||t<tr-FORM)continue;
      if(age<0){k=put(out,k,x0,m.p[1]-.02*(1+age/(FORM*T)),z0,.13*(1+age/(FORM*T)),fade,.2*d);nd++;continue}   // swelling at the pump head
      const vx=m.d[0]*.25,vz=m.d[2]*.25,y0=m.p[1],land=Math.sqrt(2*(y0-FLOOR)/GRAV),fly=Math.min(age,land);   // let go from rest: y = y0 - g t^2 / 2
      const x=x0+vx*fly,z=z0+vz*fly;
      if(age<land){k=put(out,k,x,y0-.5*GRAV*age*age,z,.13+.01*d,fade,.2*d);nd++}
      else ringAt.push([x,z,seg(age-land,0,.7),fade]);                      // landed: a ring spreads over the counter
    }
    for(const [x,z,r,f] of ringAt){
      const a=(1-r)*.55*f;
      if(a>0)for(let j=0;j<16;j++){const ph=j/16*TAU;k=put(out,k,x+Math.cos(ph)*(.04+.4*r),FLOOR,z+Math.sin(ph)*(.04+.4*r)*.55,.026,a,.5);rings++}
    }
    return [layer(nh,0,C.oil,true),layer(nm,.3,C.oil),layer(nd,.15,C.oil),layer(rings,.5,C.oil)];
  };
}

/* Hair Pomade: warm scent wisps rise from the open tin and a band of glints sweeps over the pomade surface. */
function tin(){
  const SURF=.31,W=44,GL=56;
  return (t,P,out,q=1)=>{
    let k=0,nw=0,ng=0;
    const show=bell(t,.30,.90);
    if(show<=0)return [layer(0,0,C.scent),layer(0,.2,C.glint,true)];
    for(let i=0;i<W*q;i++){
      const age=(t-(.30+.28*hash(i,51)))*6,ph=hash(i,52)*TAU,r=Math.sqrt(hash(i,53))*.36;
      if(age<=0||age>=2.6)continue;
      k=put(out,k,Math.cos(ph)*r+Math.sin(age*2.2+ph)*.07*age,SURF+age*.38,Math.sin(ph)*r+Math.cos(age*1.7+ph)*.05*age,
        .2+age*.16,Math.min(1,age/.3)*(1-seg(age,1.4,2.6))*show*.16,hash(i,54));nw++;
    }
    const sweep=-.52+1.04*ss(seg(t,.40,.64));                               // x of the band of light
    for(let i=0;i<GL*q;i++){
      const x=-.44+.88*hash(i,61),z=(hash(i,62)-.5)*.8*Math.sqrt(Math.max(0,1-(x/.46)*(x/.46))),dx=sweep-x;
      const a=Math.exp(-Math.pow(dx/.085,2))*(.55+.45*Math.sin(t*90+hash(i,63)*TAU))*show;
      if(a<.02)continue;
      k=put(out,k,x,SURF+.004,z,.03+hash(i,64)*.035,a*.9,0);ng++;
    }
    return [layer(nw,0,C.scent),layer(ng,.2,C.glint,true)];
  };
}

/* Curl Man: with the cap off, a ribbon of cream winds out of the tube in a curl, holds, then melts away. */
function tube(){
  const N=300;
  return (t,P,out,q=1)=>{
    const m=P.mouth,len=ss(seg(t,.50,.64)),fade=1-ss(seg(t,.66,.74)),NN=Math.round(N*(.5+.5*q));let k=0,n=0;
    if(!m||len<=0||fade<=0)return [layer(0,0,C.cream)];
    const d=m.d,u=Math.abs(d[1])>.9?[1,0,0]:[0,1,0];                       // two directions across the nozzle axis
    const a=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]],al=Math.hypot(a[0],a[1],a[2])||1,ax=a.map(c=>c/al);
    const bx=[d[1]*ax[2]-d[2]*ax[1],d[2]*ax[0]-d[0]*ax[2],d[0]*ax[1]-d[1]*ax[0]];
    for(let i=0;i<NN;i++){
      const s=i/(NN-1);if(s>len)break;
      const ph=s*3.2*TAU,rad=.08+.26*s*(1-.25*s),rise=1.35*s-.8*s*s*s,jit=(hash(i,71)-.5)*.02,c=Math.cos(ph)*rad,sn=Math.sin(ph)*rad;
      k=put(out,k,m.p[0]+d[0]*rise+ax[0]*c+bx[0]*sn+jit,m.p[1]+d[1]*rise+ax[1]*c+bx[1]*sn-.18*s*s,m.p[2]+d[2]*rise+ax[2]*c+bx[2]*sn+jit,
        .11+.03*Math.sin(ph*.5),(.85-.1*s)*fade,.5+.5*Math.sin(ph));n++;
    }
    return [layer(n,.35,C.cream)];
  };
}

D.fx={
  MAX,
  build:poses=>({
    powder:powder(poses),
    can:spray({N:200,nFine:170,win:[[.40,.64]],alpha:.075,mist:C.aloe,fine:C.droplet}),
    pump:spray({N:140,nFine:130,win:[[.10,.28],[.46,.64]],alpha:.07,mist:C.coco,fine:C.coco}),
    oil:oil(),tin:tin(),tube:tube()
  })
};
})();
