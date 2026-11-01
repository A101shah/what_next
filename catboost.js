"use strict";
/**
 * Browser-only exact CatBoost symmetric-tree inference from the *real* OECD
 * PIAAC occupational-family experiment. No user input is sent to a server.
 * This model does NOT predict aptitude, job success, or optimal learning topics.
 */
window.WhatNextCatBoost = (() => {
  const decoded = new WeakMap();

  function buildFeatures(input) {
    if(!Array.isArray(input.bands) || input.bands.length!==7 ||
       input.bands.some(v=>!Number.isInteger(v)||v<0||v>5)) {
      throw new Error("Choose each of the seven workplace skill-use bands from 0 through 5.");
    }
    const years=Number(input.years),level=Number(input.educationLevel),field=Number(input.educationField);
    if(!Number.isFinite(years)||years<0||years>47) {
      throw new Error("Work experience must be between 0 and 47 years.");
    }
    if(![0,1,2,3].includes(level) || !Number.isInteger(field) || field<0 || field>16) {
      throw new Error("Choose valid education level and field.");
    }
    const vector=[...input.bands,years];
    for(let n=1;n<=3;n++)vector.push(Number(level===n));
    for(let n=1;n<=16;n++)vector.push(Number(field===n));
    return vector;
  }

  function decode(model) {
    if(decoded.has(model))return decoded.get(model);
    if(!model||model.version!==1||!Array.isArray(model.classes)||
       model.classes.length!==12||!Array.isArray(model.trees)||
       model.trees.length<1||!Number.isFinite(model.quantization)||
       model.quantization<=0)throw new Error("Trained CatBoost model is unavailable or invalid.");
    const trees=model.trees.map(tree=>{
      if(!Array.isArray(tree.features)||!Array.isArray(tree.borders)||
         tree.features.length!==tree.borders.length||tree.features.length>10) {
        throw new Error("Invalid CatBoost tree metadata.");
      }
      const raw=atob(tree.leaves);
      const size=(1<<tree.features.length)*model.classes.length;
      if(raw.length!==size*2)throw new Error("CatBoost leaf data failed validation.");
      const leaves=new Float64Array(size);
      for(let k=0;k<size;k++){
        let num=raw.charCodeAt(2*k)+(raw.charCodeAt(2*k+1)<<8);
        if(num>=32768)num-=65536;
        leaves[k]=num/model.quantization;
      }
      return {features:tree.features,borders:tree.borders,leaves};
    });
    decoded.set(model,trees);
    return trees;
  }

  function predict(model,input) {
    const x=buildFeatures(input);
    if(model.input_features.length!==27||model.bias.length!==12)
      throw new Error("Unexpected model feature dimensions.");
    const scores=Float64Array.from(model.bias);
    for(const tree of decode(model)){
      let leaf=0;
      for(let j=0;j<tree.features.length;j++){
        const feature=tree.features[j];
        const value=Number.isFinite(x[feature])?x[feature]:model.median[feature];
        if(value>tree.borders[j])leaf|=(1<<j);
      }
      const offset=leaf*model.classes.length;
      for(let c=0;c<model.classes.length;c++){
        scores[c]+=model.scale*tree.leaves[offset+c];
      }
    }
    const max=Math.max(...scores);
    const exponents=Array.from(scores,score=>Math.exp(score-max));
    const total=exponents.reduce((a,b)=>a+b,0);
    const labels=window.WhatNextNeural?.LABELS||{};
    return model.classes.map((code,i)=>({
      code:String(code),
      label:labels[String(code)]||("Occupation "+code),
      probability:exponents[i]/total
    })).sort((a,b)=>b.probability-a.probability);
  }
  return { predict, buildFeatures };
})();
