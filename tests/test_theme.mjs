/** Regression tests for the visual ocean-teal dashboard refresh.
 * Execute with: node --test tests/test_theme.mjs
 * Visual browser acceptance is a separate requirement.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),css=read("styles.css");

test("all sidebar notification dots are removed, while navigation labels survive",()=>{
  assert.doesNotMatch(html,/class="new-dot"/);
  assert.doesNotMatch(css,/\.new-dot\s*\{/);
  const routes=[...html.matchAll(/class="nav-item(?: active)?"\s+data-view="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(routes,["overview","roadmap","assessment","skills","search","evidence","research","pulse","career"]);
  assert.match(html,/whatnext<span class="brand-dot">\.<\/span>/);
});

test("teal/cyan theme applies to root, sidebar, active navigation and controls",()=>{
  assert.match(html,/name="theme-color" content="#061820"/);
  assert.match(html,/href="styles\.css\?v=ocean-teal-20261103"/);
  assert.match(css,/--bg:#061820/);
  assert.match(css,/--primary:#41e3df/);
  assert.match(css,/\.sidebar\{background:linear-gradient\(165deg,#071c28/);
  assert.match(css,/\.brand-icon\{background:linear-gradient\(135deg,#4bf3ec,#04a9a8/);
  assert.match(css,/\.nav-item\.active\{background:linear-gradient\(110deg,#0b3d47,#0e333f/);
  assert.match(css,/\.primary-btn\{background:#35d6d3/);
  assert.match(css,/@media print\{body\{background:#fff!important;color:#111!important\}\}/);
  assert.doesNotMatch(css,/#a797ff|#a99bff|#9d90ff|rgba\(165,136,255/);
});

test("the cosmetic update does not remove application scripts, model, or buttons",()=>{
  const paths=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(paths,[
    "neural.js","search.js","skills.js","learning.js","assessment-ui.js",
    "research-evidence.js","deployment-diagnostics.js","app.js"
  ]);
  assert.equal([...html.matchAll(/<button\b/g)].length,43);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal([...css].reduce((depth,c)=>depth+(c==="{")-(c==="}"),0),0);
});
