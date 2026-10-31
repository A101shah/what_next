"use strict";
/* Real MLP neural-network inference, using committed model weights trained from OECD PIAAC.
 * No external AI service and no client-side data uploads. This predicts broad worker
 * occupation groups from task-use answers; it DOES NOT predict the best learning lesson.
 */
window.WhatNextNeural = (() => {
  const SKILLS = [
    ["ict","ICT / digital tasks"],
    ["numeracy","Numeracy / numerical tasks"],
    ["reading","Reading documents"],
    ["writing","Writing documents"],
    ["learning","Learning new things at work"],
    ["influence","Persuasion and influencing"],
    ["task_discretion","Independent decision making"]
  ];
  const FIELDS = [
    ["1","Economics, Business and Administration"],["2","Law"],["3","Health"],
    ["4","Welfare"],["5","Social and Behavioral Sciences"],
    ["6","Journalism and Information"],["7","Information and Communication Technologies"],
    ["8","Natural Sciences, Mathematics and Statistics"],["9","Engineering and Manufacturing"],
    ["10","Construction"],["11","Agriculture and Environment"],["12","Personal and Community Services"],
    ["13","Security and Transport"],["14","Education and Teacher Training"],
    ["15","Humanities, Languages and Arts"],["16","General education"]
  ];
  const LABELS = {
    "12":"Administrative and commercial managers",
    "13":"Production and specialized services managers",
    "21":"Science and engineering professionals",
    "22":"Health professionals","23":"Teaching professionals",
    "24":"Business and administration professionals",
    "25":"Information and communications technology professionals",
    "26":"Legal, social and cultural professionals",
    "31":"Science and engineering associate professionals",
    "32":"Health associate professionals",
    "33":"Business and administration associate professionals",
    "35":"Information and communications technicians"
  };
  const cache = new WeakMap();
  function decodeWeights(model) {
    if (cache.has(model)) return cache.get(model);
    if (!model || !model.nn || !Array.isArray(model.nn.shape)) throw Error("Neural model is unavailable.");
    const nn=model.nn;
    if(nn.shape.join(",")!=="27,20,12,12" || nn.quantization!==1000) throw Error("Unexpected neural model shape.");
    function unpack(encoded,expected) {
      const raw=atob(encoded);
      if(raw.length!==expected*2)throw Error("Corrupt neural weights.");
      const arr=new Float64Array(expected);
      for(let i=0;i<expected;i++){
        let n=raw.charCodeAt(i*2)+(raw.charCodeAt(i*2+1)<<8);
        if(n>=32768)n-=65536;
        arr[i]=n/nn.quantization;
      }
      return arr;
    }
    const layers=[];
    for(let i=0;i<nn.shape.length-1;i++){
      const input=nn.shape[i],output=nn.shape[i+1];
      layers.push({
        input, output,
        weights:unpack(nn.weights[i],input*output),
        biases:unpack(nn.biases[i],output)
      });
    }
    cache.set(model,layers);
    return layers;
  }
  function predict(model,inputs) {
    if(!model || !model.prep || !model.classes || model.classes.length!==12)throw Error("Model metadata missing.");
    if(!Array.isArray(inputs.bands) || inputs.bands.length!==7 || inputs.bands.some(v=>!Number.isInteger(v)||v<0||v>5)){
      throw Error("Please choose all seven task-use levels (0–5).");
    }
    const years=Number(inputs.years);
    if(!Number.isFinite(years)||years<0||years>47)throw Error("Work experience must be between 0 and 47 years.");
    const level=Number(inputs.educationLevel);
    const field=Number(inputs.educationField);
    if(![0,1,2,3].includes(level)||!Number.isInteger(field)||field<0||field>16){
      throw Error("Choose a valid education level and study field.");
    }
    const raw=[...inputs.bands,years];
    for(let i=1;i<=3;i++)raw.push(Number(i===level));
    for(let i=1;i<=16;i++)raw.push(Number(i===field));
    if(raw.length!==27)throw Error("Input length mismatch.");
    let values=raw.map((value,i)=>(value-model.prep.mean[i])/model.prep.scale[i]);
    for(const [index,layer] of decodeWeights(model).entries()) {
      const outputs=new Array(layer.output);
      for(let j=0;j<layer.output;j++){
        let z=layer.biases[j];
        for(let k=0;k<layer.input;k++)z+=values[k]*layer.weights[k*layer.output+j];
        outputs[j]=index<2?Math.max(0,z):z;
      }
      values=outputs;
    }
    const largest=Math.max(...values);
    const exponentials=values.map(v=>Math.exp(v-largest));
    const sum=exponentials.reduce((a,b)=>a+b,0);
    return model.classes.map((code,i)=>({
      code:String(code),label:LABELS[String(code)]||"Unknown occupation",
      probability:exponentials[i]/sum
    })).sort((a,b)=>b.probability-a.probability);
  }
  return { SKILLS, FIELDS, LABELS, predict };
})();
