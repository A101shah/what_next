// Independent offline learning-search regression tests. Run: node --test tests/test_search.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.window=globalThis;
await import('../search.js');
const paths=JSON.parse(readFileSync(new URL('../data/paths.json',import.meta.url),'utf8'));
const research=JSON.parse(readFileSync(new URL('../data/research.json',import.meta.url),'utf8'));
const helper=globalThis.WhatNextSearch;

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
