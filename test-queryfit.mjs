// Offline fixture tests for v9 food-serving isolation + query-fit ranking. No external calls.
import { createCore } from './core.js';
import assert from 'node:assert/strict';

const ent = (entity_id, name, tags, keywords, extra = {}) => ({
  entity_id, name,
  properties: { address: 'FC Road, Pune, Maharashtra', business_rating: 4.3, keywords: (keywords || []).map(n => ({ name: n })), ...(extra.properties || {}) },
  tags: (tags || []).map(n => ({ name: n }))
});

const INSIGHTS = { results: { entities: [
  ent('e-hotel-ambig', 'The Orchid Meadows', ['Hotel', 'Banquet Hall'], []),
  ent('e-hotel-eatery', 'Hotel Shreyas', ['Restaurant', 'Maharashtrian', 'Vegetarian'], ['thali', 'veg']),
  ent('e-dosa', 'Dosa Plaza FC Road', ['Restaurant', 'South Indian'], ['dosa', 'idli']),
  ent('e-cafe', 'Cafe Sereno', ['Cafe', 'Coffee'], ['espresso']),
  ent('e-lodge', 'Sunrise Lodge', ['Lodge', 'Accommodation'], []),
  ent('e-biryani', 'Blue Biryani House', ['Restaurant'], ['biryani', 'chicken'])
] } };
const SEARCH = { results: [ent('e-anchor', 'Vaishali', ['Restaurant'], [], { properties: { address: 'FC Road, Pune, Maharashtra', business_rating: 4.5, keywords: [] } })] };

const core = createCore({ QLOO_API_KEY: 'x', QLOO_STUB: async (p) => p === '/search' ? SEARCH : INSIGHTS });

const r = await core.plan({ loves: ['Vaishali'], area: 'Deccan', diet: 'any', want: 'dosa' });
const names = r.picks.map(p => p.name);
assert.ok(!names.includes('The Orchid Meadows'), 'ambiguous-name hotel dropped');
assert.ok(!names.includes('Sunrise Lodge'), 'lodge dropped');
assert.ok(names.includes('Hotel Shreyas'), 'food-serving eatery named Hotel kept');
assert.equal(names[0], 'Dosa Plaza FC Road', 'query-fit pick ranks first');
assert.equal(r.picks[0].query_fit, true);
assert.equal(r.picks.find(p => p.name === 'Cafe Sereno').query_fit, false);
assert.ok(r.crawl.some(p => p.query_fit), 'crawl includes a query-fit stop');
assert.ok(/mentioning "dosa"/.test(r.note), 'note discloses craving evidence');

// no query-fit evidence anywhere -> transparency note, taste-match only
const core2 = createCore({ QLOO_API_KEY: 'x', QLOO_STUB: async (p) => p === '/search' ? SEARCH : { results: { entities: [ent('e-cafe2', 'Cafe Sereno', ['Cafe'], ['coffee'])] } } });
const r2 = await core2.plan({ loves: ['Vaishali'], area: 'Deccan', diet: 'any', want: 'khao suey' });
assert.equal(r2.picks[0].query_fit, false);
assert.ok(/No picked place has Qloo data mentioning/.test(r2.note), 'no-evidence note present');

// anchors: food-serving hotel-named place resolvable; non-matching name rejected
const a1 = await core.resolveAnchors(['Hotel Shreyas']);
assert.equal(a1.length, 0, 'no bogus anchor match');
const SEARCH2 = { results: [ent('e-h1', 'Hotel Shreyas', ['Restaurant'], [], { properties: { address: 'Deccan, Pune', business_rating: 4.4, keywords: [] } })] };
const core3 = createCore({ QLOO_API_KEY: 'x', QLOO_STUB: async (p) => p === '/search' ? SEARCH2 : INSIGHTS });
const a2 = await core3.resolveAnchors(['Hotel Shreyas']);
assert.equal(a2.length, 1, 'food-serving hotel-named anchor resolves');

// diet filter still works with the new flag
const r3 = await core.plan({ loves: ['Vaishali'], area: 'Deccan', diet: 'veg', want: 'dosa' });
const biryani = r3.picks.find(p => p.name === 'Blue Biryani House');
const shreyas = r3.picks.find(p => p.name === 'Hotel Shreyas');
assert.ok(shreyas.score > biryani.score, 'veg pick outranks non-veg for veg diet');

console.log('OK queryfit tests'); process.exit(0);
