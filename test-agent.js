// Mock-LLM tests (no external model calls). Loop runs against live Qloo; regression tests for renderPicks are offline.
import { core } from './server.js'; import { runAgent, renderPicks } from './core.js';
import assert from 'node:assert/strict';
const mk = (names) => new Map(names.map(n => [n.toLowerCase(), { name: n, address: 'A', rating: 4.4, cost_band: '₹200 to ₹400', qloo_tags: [], reasons: ['Rated 4.4'] }]));
const rec = mk(['Real One', 'Real Two']);
// mixed valid + invented: invented dropped, valid kept
let o = renderPicks(JSON.stringify({ picks: [{ name: 'Real One', why: 'cozy' }, { name: 'Fake Place', why: 'great' }] }), rec);
assert.deepEqual(o.places.map(p => p.name), ['Real One']); assert.equal(o.dropped, 1);
// only invented -> ungrounded, no places
o = renderPicks(JSON.stringify({ picks: [{ name: 'Fake Place' }] }), rec); assert.equal(o.grounded, false); assert.equal(o.places.length, 0);
// fabricated price/rating commentary withheld; facts come from Qloo data only
o = renderPicks(JSON.stringify({ picks: [{ name: 'real one', why: 'only ₹99 and 5 stars, open till 2am' }] }), rec);
assert.equal(o.places[0].commentary, null); assert.equal(o.places[0].rating, 4.4); assert.equal(o.places[0].cost_band, '₹200 to ₹400');
// injected extra fields ignored; duplicates collapsed; free prose (no JSON) is never shown
o = renderPicks(JSON.stringify({ picks: [{ name: 'Real One', rating: 5, address: 'Mars', why: 'ok' }, { name: 'Real One' }] }), rec);
assert.equal(o.places.length, 1); assert.equal(o.places[0].address, 'A');
o = renderPicks('Try Real One, it has the best dosa for Rs 50', rec); assert.equal(o.grounded, false);
// dietary/allergen/quality claims in commentary are withheld
for (const w of ['100% vegan and gluten free','Jain friendly and nut safe','authentic and the best']) assert.equal(renderPicks(JSON.stringify({ picks: [{ name: 'Real One', why: w }] }), rec).places[0].commentary, null);
assert.equal(renderPicks(JSON.stringify({ picks: [{ name: 'Real One', why: 'Similar taste profile' }] }), rec).places[0].commentary, 'Similar taste profile');
// <think> blocks stripped; >3 picks capped
o = renderPicks('<think>x</think>' + JSON.stringify({ picks: [1, 2, 3, 4].map(i => ({ name: i < 3 ? 'Real ' + (i === 1 ? 'One' : 'Two') : 'Nope' })) }), rec); assert.equal(o.places.length, 2);
// full loop with mock LLM: placeholder anchor id is bound; invented pick dropped
let step = 0, names = [];
const llm = async (m) => { const last = m[m.length - 1]; step++;
  if (last.role === 'user') return { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'find_place', arguments: JSON.stringify({ name: 'Vaishali' }) } }] };
  if (last.tool_call_id === '1') return { role: 'assistant', content: '', tool_calls: [{ id: '2', type: 'function', function: { name: 'recommend', arguments: JSON.stringify({ anchor_ids: ['placeholder'], area: 'Deccan', diet: 'veg' }) } }] };
  names = JSON.parse(last.content).map(r => r.name);
  return { role: 'assistant', content: JSON.stringify({ picks: [{ name: names[0], why: 'similar taste' }, { name: 'Invented Cafe', why: 'x' }] }) }; };
o = await runAgent('veg near Deccan like Vaishali', core.impl, llm);
assert.equal(o.grounded, true); assert.deepEqual(o.places.map(p => p.name), [names[0]]); assert.equal(o.dropped, 1);
console.log('OK agent tests', o.places[0].name); process.exit(0);
