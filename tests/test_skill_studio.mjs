import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.window=globalThis;
await import('../skills.js');
const skills=globalThis.WhatNextSkills;
const roles=JSON.parse(readFileSync(new URL('../data/role_skills.json',import.meta.url),'utf8'));
const taxonomy=JSON.parse(readFileSync(new URL('../data/skill_taxonomy.json',import.meta.url),'utf8'));
const paths=JSON.parse(readFileSync(new URL('../data/paths.json',import.meta.url),'utf8'));

test('real source coverage never masquerades as individual respondent skills',()=>{
  assert.equal(roles.source_rows,31821);
  assert.equal(roles.occupation_count,923);
  assert.ok(roles.unique_skill_count>=8500);
  assert.equal(Object.keys(roles.roles).length,923);
  assert.match(roles.source_population,/unrelated to anonymized OECD/i);
  assert.equal(roles.skills.length,roles.unique_skill_count);
});

test('all six current destinations map to a real sourced O*NET software profile',()=>{
  for(const path of paths){
    const profile=skills.role(roles,path.soc);
    assert.ok(profile.title,`no actual source for ${path.label}`);
    assert.ok(profile.items.length>10,`too few tools for ${path.label}`);
    assert.ok(profile.items.every(item=>typeof item.name==='string'&&item.sourced));
    assert.equal(profile.n,roles.roles[path.soc].n);
  }
});

test('exact sample tools and their official occupation source are preserved',()=>{
  const ds=skills.role(roles,'15-2051.00');
  const tech=new Map(ds.items.map(item=>[item.name,item]));
  for(const name of ['Python','PostgreSQL','Docker','Flask'])
    assert.ok(tech.has(name),`missing real sourced Data Scientist example ${name}`);
  assert.ok(!tech.has('FastAPI'),"uncited tools must not be invented for an occupation");
});

test('resume-style categories and unsourced example separation',()=>{
  assert.equal(taxonomy.categories.length,8);
  const curated=skills.curated(roles,taxonomy);
  const fastapi=curated.find(skill=>skill.name==='FastAPI');
  const python=curated.find(skill=>skill.name==='Python');
  assert.ok(fastapi);
  assert.equal(fastapi.sourced,false);
  assert.equal(fastapi.category,'backend');
  assert.equal(python.sourced,true);
  assert.equal(python.category,'languages');
});

test('personal skill coverage is a direct explicit-name intersection, not a fake proficiency score',()=>{
  const person=skills.normalizeUserSkills(['python','Python','docker','FastAPI','Figma'],taxonomy);
  assert.deepEqual(person,['Python','Docker','FastAPI','Figma']);
  const profile=skills.role(roles,'15-2051.00');
  const comparison=skills.compare(profile.items,person);
  assert.ok(comparison.matched.some(item=>item.name==='Python'));
  assert.ok(comparison.matched.some(item=>item.name==='Docker'));
  assert.ok(!comparison.matched.some(item=>item.name==='FastAPI'));
  assert.equal(comparison.observed,profile.items.length);
  assert.equal(comparison.matched.length+comparison.unexplored.length,profile.items.length);
});

test('every packed skill index is within source catalogue',()=>{
  for(const profile of Object.values(roles.roles)){
    for(const packed of profile.t){
      assert.ok(Number.isInteger(packed));
      const index=Math.floor(packed/4);
      assert.ok(index>=0&&index<roles.skills.length);
      assert.ok((packed%4)>=0 && (packed%4)<=3);
    }
  }
});
