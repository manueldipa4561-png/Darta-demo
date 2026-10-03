/* Darta store: catalog loading + cart state (localStorage). No backend: totals are computed client-side. */
(()=>{
'use strict';
const D=window.DARTA,KEY='darta-cart-v1',MAXQ=9,MAXLINES=20,ID=/^[a-z0-9-]{1,32}$/;

/** The catalog with the English fields of `en` laid over the Italian ones (names, taglines, texts, category and coupon labels). */
const translated=(cat,en)=>({
  ...cat,
  coupons:Object.fromEntries(Object.entries(cat.coupons).map(([k,c])=>[k,{...c,...(en.coupons&&en.coupons[k])}])),
  cats:cat.cats.map(c=>({...c,label:(en.cats&&en.cats[c.id])||c.label})),
  products:cat.products.map(p=>({...p,...(en.products&&en.products[p.id])}))
});

D.store={
  catalog:null,byId:Object.create(null),bySlug:Object.create(null),lines:[],coupon:'',mode:'pickup',ls:new Set(),

  async load(){
    const en=D.lang==='en';   // English pages: the same catalog with the translated copy laid on top (data/catalog.en.json)
    const [res,over]=await Promise.all([fetch('/data/catalog.json'),en?fetch('/data/catalog.en.json'):null]);
    if(!res.ok)throw new Error('catalog '+res.status);
    if(over&&!over.ok)throw new Error('catalog.en '+over.status);
    this.catalog=await res.json();
    if(over)this.catalog=translated(this.catalog,await over.json());
    this.catalog.coupons=Object.assign(Object.create(null),this.catalog.coupons);   // no prototype keys as coupon codes
    this.catalog.products=this.catalog.products.filter(p=>ID.test(p.id)&&ID.test(p.slug));   // ids end up in selectors and object keys
    this.catalog.products.forEach(p=>{this.byId[p.id]=p;this.bySlug[p.slug]=p});
    this.restore();
    this.emit();
    return this.catalog;
  },
  on(fn){this.ls.add(fn);return()=>this.ls.delete(fn)},
  emit(){this.ls.forEach(f=>f(this))},

  variant(p,vid){return p.variants?(p.variants.find(v=>v.id===vid)||p.variants[1]||p.variants[0]):null},
  unit(p,vid){const v=this.variant(p,vid);return v?v.price:p.price},
  key(id,vid){return vid?id+':'+vid:id},
  lineLabel(p,vid){const v=this.variant(p,vid);return v?`${p.name} ${v.label}`:p.name},

  add(id,vid,q=1){
    const p=this.byId[id];if(!p)return;
    if(p.variants){if(!p.variants.some(v=>v.id===vid))vid=(p.variants[1]||p.variants[0]).id}   // unknown variant -> default
    else vid='';
    const k=this.key(id,vid),l=this.lines.find(x=>x.k===k);
    if(!l&&this.lines.length>=MAXLINES)return;
    if(l)l.q=Math.min(MAXQ,l.q+q);else this.lines.push({k,id,v:vid||'',q:Math.min(MAXQ,q)});
    this.save();this.emit();
  },
  setQty(k,q){
    const l=this.lines.find(x=>x.k===k);if(!l)return;
    if(q<=0)this.lines=this.lines.filter(x=>x!==l);else l.q=Math.min(MAXQ,q);
    this.save();this.emit();
  },
  remove(k){this.lines=this.lines.filter(x=>x.k!==k);this.save();this.emit()},
  clear(){this.lines=[];this.coupon='';this.save();this.emit()},
  setMode(m){this.mode=m==='ship'?'ship':'pickup';this.save();this.emit()},
  applyCoupon(code){
    code=(code||'').trim().toUpperCase();
    if(!code){this.coupon='';this.save();this.emit();return {ok:true}}
    if(!this.catalog.coupons[code])return {ok:false};
    this.coupon=code;this.save();this.emit();return {ok:true,code};
  },

  // all money in cents
  totals(){
    const cfg=this.catalog.shipping,items=this.lines.map(l=>{const p=this.byId[l.id];return {l,p,unit:this.unit(p,l.v)}});
    const subtotal=items.reduce((s,x)=>s+x.unit*x.l.q,0);
    const physical=items.filter(x=>!x.p.digital);
    const base=physical.reduce((s,x)=>s+x.unit*x.l.q,0);
    const cp=this.coupon&&this.catalog.coupons[this.coupon];
    const discount=cp?Math.round(base*cp.pct/100):0;
    const goods=subtotal-discount;
    const physGoods=base-discount;                    // free shipping is earned by physical goods only
    const hasPhysical=physical.length>0;
    const ship=hasPhysical&&this.mode==='ship';
    const shipping=ship?(physGoods>=cfg.freeFrom?0:cfg.flat):0;
    return {
      items,count:items.reduce((s,x)=>s+x.l.q,0),subtotal,discount,shipping,total:goods+shipping,
      hasPhysical,ship,digitalOnly:!hasPhysical&&items.length>0,
      freeLeft:ship?Math.max(0,cfg.freeFrom-physGoods):0,freeFrom:cfg.freeFrom,flat:cfg.flat,
      couponLabel:cp?cp.label:''
    };
  },

  save(){try{localStorage.setItem(KEY,JSON.stringify({lines:this.lines.map(({k,id,v,q})=>({k,id,v,q})),coupon:this.coupon,mode:this.mode}))}catch(e){/* storage blocked: cart lives in memory */}},
  restore(){
    try{
      const v=JSON.parse(localStorage.getItem(KEY))||{};
      this.lines=(Array.isArray(v.lines)?v.lines:[]).slice(0,100).filter(l=>{
        if(!l||typeof l.id!=='string'||typeof l.v!=='string')return false;   // only plain strings can be ids/variants
        const p=this.byId[l.id];
        return p&&Number.isInteger(l.q)&&l.q>0&&l.q<=MAXQ&&(p.variants?!!p.variants.find(x=>x.id===l.v):!l.v);
      }).reduce((acc,l)=>{
        const k=this.key(l.id,l.v),dup=acc.find(x=>x.k===k);   // merge duplicate saved lines
        if(dup)dup.q=Math.min(MAXQ,dup.q+l.q);else acc.push({k,id:l.id,v:l.v||'',q:l.q});
        return acc;
      },[]).slice(0,MAXLINES);
      this.coupon=this.catalog.coupons[v.coupon]?v.coupon:'';
      this.mode=v.mode==='ship'?'ship':'pickup';
    }catch(e){/* corrupt or blocked storage: start with an empty cart */}
  }
};
})();
