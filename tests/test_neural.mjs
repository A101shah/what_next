// Offline browser-model verification. Run: node --test tests/test_neural.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = globalThis;
await import('../neural.js');
const net = globalThis.WhatNextNeural;
const model = JSON.parse(readFileSync(new URL('../data/career_nn.json', import.meta.url), 'utf8'));

test('trained MLP has original real-data holdout metrics', () => {
  assert.equal(model.samples,6517);
  assert.equal(model.training_samples,5213);
  assert.equal(model.test_samples,1304);
  assert.equal(model.nn.shape.join(','),'27,20,12,12');
  assert.equal(model.metrics.accuracy,0.4049);
  assert.ok(model.metrics.accuracy>model.metrics.majority_baseline_accuracy);
});

test('browser inference returns finite normalized probabilities for 12 families', () => {
  const predictions=net.predict(model,{
    bands:[4,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7
  });
  assert.equal(predictions.length,12);
  assert.ok(predictions.every(x=>x.probability>=0 && x.probability<=1));
  assert.ok(Math.abs(predictions.reduce((sum,x)=>sum+x.probability,0)-1)<1e-9);
  assert.equal(predictions[0].code,'25');
});

test('refuses malformed user responses and invalid model shape', () => {
  assert.throws(()=>net.predict(model,{
    bands:[8,4,4,4,3,4,3],years:4,educationLevel:3,educationField:7
  }), /seven/);
  assert.throws(()=>net.predict(model,{
    bands:[4,4,4,4,3,4,3],years:60,educationLevel:3,educationField:7
  }), /47/);
});
