"use strict";
/**
 * On-device search across the WhatNext catalogue and explicitly attributed links.
 * Does not search Google internally. Google web results are opened via a real
 * google.com/search link or embedded ONLY if the site owner supplies their
 * own Google Programmable Search Engine ID (see data/search_config.json).
 */
window.WhatNextSearch = (() => {
  const ALIASES={
    "rag":"retrieval augmented generation",
    "llm":"language model transformer",
    "nlp":"natural language processing",
    "nn":"neural networks",
    "pca":"principal component clustering",
    "ml":"machine learning",
    "anova":"statistics hypothesis testing",
    "cv":"cross validation",
    "sql":"database sql",
    "docker":"deployment docker",
    "aws":"cloud deployment"
  };
  function normalize(value){
    return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[^a-z0-9]+/g," ").trim();
  }
  function tokens(query){
    const words=normalize(query).split(/\s+/).filter(Boolean).slice(0,10);
    const all=new Set(words);
    for(const word of words){
      for(const phrase of (ALIASES[word]||"").split(/\s+/))if(phrase)all.add(phrase);
    }
    return [...all];
  }
  function rank(entry,query) {
    const q=normalize(query);
    const words=tokens(query);
    const title=normalize(entry.title),desc=normalize(entry.description);
    const tags=normalize(entry.tags);
    let score=0,matched=0;
    for(const word of words){
      const found=title.includes(word)||tags.includes(word)||desc.includes(word);
      if(found){
        matched++;
        score+=(title.includes(word)?10:0)+(tags.includes(word)?5:0)+(desc.includes(word)?2:0);
      }
    }
    if(!matched)return 0;
    if(q.length>1 && title.includes(q))score+=24;
    // Avoid a generic result which matches only one word of a long query.
    score+=Math.round(12*matched/Math.max(1,words.length));
    if(entry.type==="Learning resource")score+=3;
    return score;
  }
  function catalogue(paths,research){
    const results=[];
    const help=[
      {title:"How WhatNext chooses your next lesson",description:"Roadmap uses career destination, completed prerequisites, topic order and your interests. The neural network does not train on learning outcomes.",tags:"help recommendation accuracy roadmap prerequisites",view:"roadmap"},
      {title:"How to check your career model result",description:"Inspect the 80/20 held-out evaluation, model comparisons and limitations in the Career Intelligence workspace.",tags:"help accuracy neural network catboost f1 model comparison",view:"evidence"},
      {title:"Update my completed learning skills",description:"Set your existing skills, goals and weekly study time in your student profile.",tags:"profile skills completed study hours",view:"profile"},
      {title:"Explore verified workforce skills",description:"See OECD PIAAC observations about education, work experience and workplace skill use in the career explorer.",tags:"oecd PIAAC career skills evidence occupations",view:"evidence"},
      {title:"Create an evidence-based resume",description:"Export a resume using only your own achievements and declared skills.",tags:"resume portfolio cv job application",view:"career"}
    ];
    for(const e of help)results.push({...e,type:"In-app guide"});
    for(const path of paths||[]){
      for(const topic of path.topics||[]){
        if(!topic||typeof topic.resource!=="string"||!topic.resource.startsWith("https://"))continue;
        results.push({
          type:"Learning resource",title:topic.title,
          description:topic.description+" · "+path.label+" · Practice: "+topic.project,
          tags:[path.label,path.field,path.research,topic.category,topic.title].join(" "),
          url:topic.resource,view:"roadmap",pathId:path.id,topicId:topic.id
        });
      }
    }
    // Keep only already-dated publications; external feeds may list future dates.
    const now=new Date().toISOString().slice(0,10);
    for(const [id,publications] of Object.entries(research?.items||{})){
      const path=(paths||[]).find(p=>p.id===id);
      for(const paper of (Array.isArray(publications)?publications:[])){
        if(!paper||!paper.title||!/^https:\/\//.test(paper.url||""))continue;
        if(paper.date && paper.date>now)continue;
        results.push({
          type:"Research publication",title:paper.title,
          description:[paper.venue,paper.date,path?.label].filter(Boolean).join(" · "),
          tags:[id,path?.field,path?.research].filter(Boolean).join(" "),
          url:paper.url,view:"pulse"
        });
      }
    }
    return results;
  }
  function search(entries,query,limit=12) {
    if(!normalize(query))return [];
    return (entries||[]).map(e=>({...e,score:rank(e,query)}))
      .filter(e=>e.score>0)
      .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title))
      .slice(0,limit);
  }
  function googleUrl(query,mode="all"){
    const clean=String(query||"").trim().slice(0,250);
    if(!clean)return "https://www.google.com/";
    const scoped=mode==="official" ? clean+" (site:developers.google.com OR site:scikit-learn.org OR site:docs.python.org OR site:pytorch.org OR site:statquest.org)" :
      mode==="ours" ? clean+" site:a101shah.github.io/what_next/" : clean;
    return "https://www.google.com/search?q="+encodeURIComponent(scoped);
  }
  return {normalize,tokens,rank,catalogue,search,googleUrl};
})();
