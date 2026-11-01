// Run offline: node --test tests/test_catboost_search.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window=globalThis;
await import('../neural.js');
await import('../catboost.js');
await import('../search.js');

const treeModel=JSON.parse(readFileSync(new URL('../data/career_catboost.json',import.meta.url),'utf8'));
const neuralModel=JSON.parse(readFileSync(new URL('../data/career_nn.json',import.meta.url),'utf8'));
const paths=JSON.parse(readFileSync(new URL('../data/paths.json',import.meta.url),'utf8'));
const research=JSON.parse(readFileSync(new URL('../data/research.json',import.meta.url),'utf8'));
const boosted=globalThis.WhatNextCatBoost;
const neural=globalThis.WhatNextNeural;
const helper=globalThis.WhatNextSearch;

test('CatBoost is a real 350-tree held-out evaluated model',()=>{
  assert.equal(treeModel.n_trees,350);
  assert.equal(treeModel.trees.length,350);
  assert.equal(treeModel.input_features.length,27);
  assert.equal(treeModel.metrics.rows,6517);
  assert.equal(treeModel.metrics.train_rows,5213);
  assert.equal(treeModel.metrics.test_rows,1304);
  assert.equal(treeModel.metrics.browser_quantized_test_accuracy,0.4225);
  assert.ok(treeModel.metrics.accuracy>neuralModel.metrics.accuracy);
  assert.ok(treeModel.train_cross_validation.every(x=>x.folds.length===3));
});

test('browser CatBoost inference matches independently computed quantized reference',()=>{
  const inputs=[
    {bands:[4,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7,code:'25',proba:.59358852},
    {bands:[1,2,3,2,1,2,1],years:0,educationLevel:2,educationField:14,code:'23',proba:.55029517},
    {bands:[5,5,5,5,5,5,5],years:20,educationLevel:3,educationField:9,code:'13',proba:.33833851}
  ];
  for(const {code,proba,...answer} of inputs){
    const ranked=boosted.predict(treeModel,answer);
    assert.equal(ranked.length,12);
    assert.equal(ranked[0].code,code);
    assert.ok(Math.abs(ranked[0].probability-proba)<.00003);
    assert.ok(Math.abs(ranked.reduce((sum,x)=>sum+x.probability,0)-1)<1e-8);
  }
});

test('browser model rejects invalid inputs',()=>{
  const example={bands:[4,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7};
  assert.throws(()=>boosted.predict(treeModel,{...example,bands:[9,2]}),/seven/);
  assert.throws(()=>boosted.predict(treeModel,{...example,years:-5}),/47/);
  assert.throws(()=>boosted.predict(treeModel,{...example,educationField:99}),/education/);
});

test('curated search includes actual syllabus links and not invented Google results',()=>{
  const entries=helper.catalogue(paths,research);
  const rag=helper.search(entries,'rag',15);
  assert.ok(rag.some(x=>/retrieval.augmented/i.test(x.title)&&x.url.startsWith('https://')));
  const stats=helper.search(entries,'statistics',12);
  assert.ok(stats.length>0);
  assert.ok(stats.some(x=>/statistic/i.test(x.title)));
  assert.equal(helper.search(entries,'  ').length,0);
  assert.ok(helper.googleUrl('neural network').startsWith('https://www.google.com/search?q='));
  assert.ok(decodeURIComponent(helper.googleUrl('regression','official')).includes('site:scikit-learn.org'));
  assert.equal(entries.filter(x=>x.type==='Research publication'&&x.description.match(/2027/)).length,0);
});

test('NN is kept for honest comparison',()=>{
  const result=neural.predict(neuralModel,{bands:[4,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7});
  assert.equal(result.length,12);
  assert.ok(Math.abs(result.reduce((sum,x)=>sum+x.probability,0)-1)<1e-8);
});
