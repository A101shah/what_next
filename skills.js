"use strict";
/* WhatNext Skill Studio. Source links are O*NET occupation-level software
   examples, NOT skills personally observed for OECD survey respondents. */
window.WhatNextSkills=(()=>{
  const norm=x=>String(x||"").trim().toLowerCase().replace(/[^a-z0-9+#.]+/g," ").replace(/ +/g," ").trim();
  function catalog(model) {
    if(!model || !Array.isArray(model.skills))return [];
    return model.skills.map(([name,category,n,d,h],id)=>({
      id,name,category,occupationCount:n,demandCount:d,hotCount:h,
      sourced:true,hot:false,inDemand:false,flags:0
    }));
  }
  function role(model,code) {
    const data=model?.roles?.[code];
    if(!data)return {title:null,items:[],n:0};
    const entries=[];
    for(const packed of data.t){
      const index=Math.floor(packed/4),flags=packed%4;
      const skill=model.skills[index];
      if(!skill)continue;
      entries.push({
        id:index,name:skill[0],category:skill[1],
        occupationCount:skill[2],demandCount:skill[3],hotCount:skill[4],
        flags,hot:Boolean(flags&1),inDemand:Boolean(flags&2),sourced:true
      });
    }
    entries.sort((a,b)=>Number(b.inDemand)-Number(a.inDemand)||
      Number(b.hot)-Number(a.hot)||b.occupationCount-a.occupationCount||
      a.name.localeCompare(b.name));
    return {title:data.title,n:data.n,items:entries};
  }
  function curated(model,taxonomy) {
    const src=catalog(model);
    const indexed=new Map(src.map(item=>[norm(item.name),item]));
    return (taxonomy?.terms||[]).map(term=>{
      const observed=indexed.get(norm(term.name));
      return observed?{...observed,category:term.category}:{
        id:null,name:term.name,category:term.category,
        occupationCount:0,demandCount:0,hotCount:0,
        flags:0,hot:false,inDemand:false,sourced:false
      };
    });
  }
  function normalizeUserSkills(items,taxonomy,max=120){
    const aliases=new Map();
    for(const term of taxonomy?.terms||[])
      for(const name of [term.name,...term.aliases||[]])aliases.set(norm(name),term.name);
    const found=new Set(),output=[];
    for(const item of items||[]){
      if(typeof item!=="string")continue;
      const label=item.trim().replace(/\s+/g," ").slice(0,70);
      const key=norm(label);
      if(!key||found.has(key)||key.length>70)continue;
      const canonical=aliases.get(key)||label;
      if(found.has(norm(canonical)))continue;
      found.add(key);found.add(norm(canonical));
      output.push(canonical);
      if(output.length>=max)break;
    }
    return output;
  }
  function compare(items,selected){
    const known=new Set((selected||[]).map(norm));
    return {
      observed:items.length,
      matched:items.filter(x=>known.has(norm(x.name))),
      unexplored:items.filter(x=>!known.has(norm(x.name)))
    };
  }
  function categoryOf(name,model,taxonomy){
    const n=norm(name);
    for(const term of taxonomy?.terms||[])if([term.name,...term.aliases||[]].some(x=>norm(x)===n))return term.category;
    const item=(model?.skills||[]).find(x=>norm(x[0])===n);
    return item?item[1]:"other";
  }
  return {norm,catalog,role,curated,compare,normalizeUserSkills,categoryOf};
})();
