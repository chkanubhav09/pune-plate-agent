// Shared logic for Node (server.js) and Cloudflare Workers (worker.js). ESM, no dependencies.
const AREAS = { 'koregaon park':[18.5362,73.8937],'kalyani nagar':[18.5463,73.903],'deccan':[18.5196,73.8410],'fc road':[18.5236,73.8410],'camp':[18.5130,73.8790],'viman nagar':[18.5679,73.9143],'baner':[18.5590,73.7868],'aundh':[18.5580,73.8075],'kothrud':[18.5074,73.8077],'shivajinagar':[18.5308,73.8475],'hadapsar':[18.5089,73.9259],'magarpatta':[18.5146,73.9290],'wakad':[18.5990,73.7600],'hinjewadi':[18.5912,73.7389],'pimpri':[18.6279,73.7997],'sadashiv peth':[18.5150,73.8530],'laxmi road':[18.5156,73.8560],'swargate':[18.5018,73.8636],'kondhwa':[18.4690,73.8900],'bavdhan':[18.5130,73.7790],'pune':[18.5204,73.8567] };
const areaPoint = a => { const k = a.toLowerCase().replace(/,?\s*pune/, '').trim(); return AREAS[k] || Object.entries(AREAS).find(([n]) => k.includes(n))?.[1] || AREAS.pune; };
const NOTFOOD = /hotel|resort|lodge|hostel|inn\b|oyo|collection o|apartment|villa|suites?|guest ?house|residency|rooms|stays?|banquet|convention|lawns?/i;
// v9: food-serving isolation. Lodging is detected from the name or Qloo tag/keyword names (never the address
// or description, which often contain words like "Residency"). A venue with lodging signals is kept only when
// Qloo data also marks it food-serving (a hotel's restaurant, or eateries traditionally named "Hotel ...").
const LODGING = /hotel|resort|lodge|hostel|inn\b|guest ?house|serviced apartment|accommodation|lodging|banquet|convention|wedding|lawn/i;
const FOODSERVE = /restaurant|cafe|caf\u00e9|diner|eatery|bakery|bistro|food|dhaba|kitchen|grill|pizzeria|coffee|snack|sweet|confection|ice ?cream|juice|street|canteen|thali|bar\b|pub|lounge|dessert|brunch|dining|cuisine|dosa|idli|pizza|burger|biryani|veg|tiffin/i;
const tagKw = e => [...(e.tags || []).map(t => t.name), ...(e.properties?.keywords || []).map(k => k.name)].filter(Boolean).join(' | ');
const foodServing = e => FOODSERVE.test(e.name) || FOODSERVE.test(tagKw(e));
const droppable = e => (NOTFOOD.test(e.name) || LODGING.test(tagKw(e))) && !foodServing(e);
const NONVEG = /chicken|mutton|fish|prawn|egg|kebab|non.?veg|seafood|lamb/i;
const VEGHINT = /veg|jain|pure|shuddh|vegan|vegetarian/i;
const SLOTS = ['Start here', 'Then', 'Finish with'];

export function createCore(env) {
  const HOST = env.QLOO_HOST || 'https://hackathon.api.qloo.com';
  const q = env.QLOO_STUB || (async (p, params) => {
    const u = new URL(HOST + p); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { 'X-Api-Key': env.QLOO_API_KEY }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('Qloo ' + r.status); return r.json();
  });
  async function resolveAnchors(names) {
    const out = [];
    for (const n of names.slice(0, 5)) {
      const r = await q('/search', { query: n + ' Pune', types: 'urn:entity:place', limit: 3 }).catch(() => null);
      const toks = n.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const hit = r && (r.results || []).find(e => /pune|maharashtra/i.test(e.properties?.address || '') && !droppable(e) && toks.some(t => e.name.toLowerCase().includes(t)));
      if (hit) out.push({ id: hit.entity_id, name: hit.name, address: hit.properties.address, input: n });
    }
    return out;
  }
  async function plan({ loves = [], area = 'Pune', diet = 'any', want = '', budget = 'any', _ids }) {
    const anchors = _ids ? _ids.map(id => ({ id, name: id })) : await resolveAnchors(loves);
    if (!anchors.length) return { error: 'None of those places were found in Pune. Try names like Vaishali, Kayani Bakery.' };
    const [lat, lon] = areaPoint(area), loc = /pune/i.test(area) ? area : area + ', Pune';
    let radius = 2500;
    const params = { 'filter.type': 'urn:entity:place', 'filter.location': `POINT(${lon} ${lat})`, 'filter.location.radius': radius, 'signal.interests.entities': anchors.map(a => a.id).join(','), take: 30 };
    let ents = (await q('/v2/insights', params)).results?.entities || [];
    if (ents.length < 6) { radius = 6000; params['filter.location.radius'] = radius; ents = (await q('/v2/insights', params)).results?.entities || []; }
    const wantRe = want.trim() ? new RegExp(want.trim().split(/[\s,]+/).filter(Boolean).map(w => w.replace(/[^\w]/g, '')).filter(Boolean).join('|'), 'i') : null;
    const anchorIds = new Set(anchors.map(a => a.id));
    const picks = ents.filter(e => !anchorIds.has(e.entity_id) && !droppable(e)).map((e, i) => {
      const allTags = e.tags || [], tags = allTags.map(t => t.name), kw = (e.properties?.keywords || []).map(k => k.name);
      const text = [e.name, ...tags, ...kw, e.properties?.description || ''].join(' | ');
      let s = 100 - i * 2 + (e.properties?.business_rating || 3.5) * 4; const why = ['Taste match to ' + anchors.map(a => a.name).join(' + ')];
      const qf = wantRe ? wantRe.test(text) : null;
      if (qf) { s += 25; why.push('Qloo tags or keywords mention "' + want.trim() + '"'); }
      if (diet === 'veg') { if (NONVEG.test(text) && !VEGHINT.test(e.name)) s -= 60; if (VEGHINT.test(text)) { s += 12; why.push('Qloo tags mention vegetarian (not a guarantee, confirm with the restaurant)'); } }
      if (diet === 'nonveg' && NONVEG.test(text)) { s += 12; why.push('Qloo tags mention non-veg dishes'); }
      const price = tags.find(t => /₹|budget|cheap|inexpensive|moderate|expensive|fine dining|premium/i.test(t));
      const rupee = price && (price.match(/₹\s?([\d,]+)/) || [])[1], lo = rupee ? +rupee.replace(/,/g, '') : null;
      if (budget === 'low' && ((lo && lo > 500) || (price && /expensive|fine dining|premium/i.test(price)))) s -= 40;
      if (budget === 'low' && ((lo && lo <= 300) || (price && /budget|cheap|inexpensive/i.test(price)))) { s += 10; why.push('Qloo cost band: ' + price + ' (may be out of date)'); }
      if (e.properties?.business_rating >= 4.2) why.push('Rated ' + e.properties.business_rating.toFixed(1));
      return { id: e.entity_id, name: e.name, address: e.properties?.address, rating: e.properties?.business_rating || null, description: e.properties?.description || null,
        tags: allTags.filter(t => !/not_for_display|noise|setting|service_options/.test(t.id || t.type || '')).map(t => t.name).slice(0, 6), price: price || null, query_fit: qf, why, score: Math.round(s),
        map: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.name + ' ' + (e.properties?.address || '')) };
    }).sort((a, b) => (b.query_fit === true) - (a.query_fit === true) || b.score - a.score).slice(0, 8);
    const fitCount = wantRe ? picks.filter(p => p.query_fit).length : null;
    const reach = radius === 6000
      ? `Qloo taste search within about 6km of ${loc} - widened from 2.5km because Qloo returned few matches nearby.`
      : `Qloo taste search within about 2.5km of ${loc}.`;
    let note = reach + ' Ranked by taste-graph affinity to your anchors, not by distance: picks may sit anywhere in that radius, including outside the named neighbourhood. Diet and craving adjust the ranking. Lodging venues are excluded unless Qloo data marks them food-serving. This is the rule-based planner, not the AI agent.';
    if (wantRe) note += fitCount ? ' ' + fitCount + ' pick(s) have Qloo data mentioning "' + want.trim() + '".' : ' No picked place has Qloo data mentioning "' + want.trim() + '" - shown as taste matches only, not confirmed to serve it.';
    return { anchors, area: loc, radius_m: radius, diet, picks, crawl: picks.slice(0, 3).map((p, i) => ({ slot: SLOTS[i], ...p })), note };
  }
  const impl = {
    find_place: async ({ name }) => (await resolveAnchors([name]))[0] || { error: 'not found in Pune' },
    recommend: async ({ anchor_ids = [], area = 'Pune', diet = 'any', budget = 'any', craving = '' }) => {
      const r = await plan({ area, diet, budget, want: craving, _ids: anchor_ids });
      return r.picks ? r.picks.slice(0, 6).map(p => ({ name: p.name, address: p.address, rating: p.rating, qloo_tags: p.tags, cost_band: p.price, query_fit: p.query_fit, reasons: p.why })) : r;
    } };
  return { plan, impl, resolveAnchors };
}

export const TOOLS = [
  { type: 'function', function: { name: 'find_place', description: 'Look up a Pune restaurant/cafe by name in the Qloo taste graph. Returns entity id, name, address.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
  { type: 'function', function: { name: 'recommend', description: 'Ask Qloo for Pune places with taste affinity to the given anchor entity ids near an area. Optional diet (veg|nonveg|any), budget (low|any), craving keywords.', parameters: { type: 'object', properties: { anchor_ids: { type: 'array', items: { type: 'string' } }, area: { type: 'string' }, diet: { type: 'string' }, budget: { type: 'string' }, craving: { type: 'string' } }, required: ['anchor_ids', 'area'] } } }];
const SYSTEM = 'You plan food outings in Pune. Ground everything in Qloo via the tools: find_place for each place the user names, then recommend with the exact id string copied from find_place. Never invent restaurants. When done, reply with ONLY JSON: {"picks":[{"name":"<exact name from a recommend result>","why":"<one short taste-fit sentence, no prices, ratings or menu claims>"}]} with up to 3 picks. The app shows facts from Qloo itself; your text is shown only as unverified commentary.';

// llm(messages, tools) -> assistant message {content, tool_calls?}. Provider supplied by the host.
const norm = n => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
// Only allowlisted Qloo results are rendered. Model text is commentary only; any pick not in the tool results is dropped,
// and commentary with digits/currency (possible invented prices, ratings, hours) is withheld.
// Commentary that could read as a diet/allergen/safety/quality guarantee is withheld; only Qloo-sourced, caveated tags are shown.
const RISKY = /veg|vegan|jain|halal|kosher|gluten|allerg|nut|dairy|lactose|egg|pork|beef|meat|eggless|safe|pure|hygien|clean|certified|guarantee|best|authentic|healthy|organic|open|late|delivery/i;
export function renderPicks(content, recData) {
  const txt = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, ''); let picks = [];
  try { const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); picks = Array.isArray(j.picks) ? j.picks : []; } catch { /* unparseable */ }
  const seen = new Set(), places = []; let dropped = 0;
  for (const p of picks) { const r = recData.get(norm(p?.name));
    if (!r || seen.has(norm(r.name))) { dropped++; continue; } seen.add(norm(r.name));
    const w = typeof p.why === 'string' ? p.why.trim().slice(0, 200) : '';
    places.push({ name: r.name, address: r.address, rating: r.rating, cost_band: r.cost_band, qloo_tags: r.qloo_tags, query_fit: r.query_fit ?? null, reasons: (r.reasons || []).map(x => x.replace(/^Taste match to [0-9A-Fa-f-]{36}$/, 'Taste match to the place you named (Qloo)')), commentary: w && !/[0-9₹$€£]/.test(w) && !RISKY.test(w) ? w : null });
    if (places.length === 3) break; }
  if (!places.length) return { places: [], grounded: false, error: 'ungrounded_answer', dropped };
  return { places, grounded: true, dropped };
}
export async function runAgent(userText, impl, llm, maxSteps = 6) {
  // /no_think: Qwen3's reasoning otherwise consumes the whole token budget before emitting any tool call (observed Oct 29: 2048-token thinking, zero tool calls). With it, tool calls arrive structured at ~3 neurons each.
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: userText + '\n/no_think' }], trace = [];
  const knownIds = new Set(), recData = new Map();
  for (let i = 0; i < maxSteps; i++) {
    const msg = await llm(messages, TOOLS);
    messages.push(msg);
    if (!msg.tool_calls?.length) return { ...renderPicks(msg.content, recData), trace };
    for (const c of msg.tool_calls) {
      const args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : (c.function.arguments || {});
      let out;
      if (c.function.name === 'recommend' && knownIds.size === 1 && !(args.anchor_ids || []).every(id => knownIds.has(id))) args.anchor_ids = [...knownIds]; // model sent a placeholder id: bind to the single place it looked up
      if (c.function.name === 'recommend' && !(args.anchor_ids || []).every(id => knownIds.has(id))) out = { error: 'unknown anchor_ids. Copy an id exactly from a find_place result. Valid ids: ' + JSON.stringify([...knownIds]) };
      else try { out = await impl[c.function.name](args); } catch (e) { out = { error: String(e.message || e) }; }
      if (c.function.name === 'find_place' && out?.id) knownIds.add(out.id);
      if (c.function.name === 'recommend' && Array.isArray(out)) out.forEach(r => r?.name && !recData.has(norm(r.name)) && recData.set(norm(r.name), r));
      trace.push({ tool: c.function.name, args });
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }
  throw new Error('agent_step_limit');
}
// Metered-quota guard: every request (including retries) counts. env.LLM_BUDGET = { maxCalls, maxNeurons, calls:0, neurons:0 }.
// Aborts before a call past maxCalls; measured usage.neurons (unknown counted as 60) is a stop signal only, not a ceiling. Prompt and output are capped.
const MAX_PROMPT_CHARS = 24000, MAX_OUT_TOKENS = 2048; // 2048: Qwen3 is a reasoning model; its thinking consumed the old 700 cap before any tool call or JSON was emitted
export const openAiCompatLlm = env => async (messages, tools) => {
  const b = env.LLM_BUDGET;
  if (b && (b.calls >= b.maxCalls || b.neurons >= b.maxNeurons)) throw new Error('budget_exhausted');
  if (JSON.stringify(messages).length > MAX_PROMPT_CHARS) throw new Error('prompt_too_large');
  if (b) b.calls++;
  const r = await fetch(env.LLM_BASE_URL.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LLM_API_KEY }, body: JSON.stringify({ model: env.LLM_MODEL, messages, tools, temperature: 0.2, max_tokens: MAX_OUT_TOKENS }), signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error('LLM ' + r.status); const j = await r.json(); if (b) b.neurons += Number(j.usage?.neurons ?? 60);
  const m = j.choices?.[0]?.message; if (!m) throw new Error('LLM empty'); return { role: 'assistant', content: m.content ?? '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) };
};
// Cloudflare Workers AI binding (env.AI) with the same tool-calling shape.
export const workersAiLlm = (env, model) => async (messages, tools) => {
  let r;
  try {
    r = await env.AI.run(model, { messages, tools, temperature: 0.2 });
  } catch (e) {
    // Some Workers AI model bindings reject OpenAI-shaped tools; retry with the
    // native function-calling shape { name, description, parameters }.
    if (!String(e).includes('5006')) throw e;
    try {
      r = await env.AI.run(model, { messages, tools: tools.map((t) => t.function), temperature: 0.2 });
    } catch (e2) {
      throw new Error('openai-shape: [' + String(e) + '] | native-shape: [' + String(e2) + ']');
    }
  }
  const m = r.choices?.[0]?.message || r;
  const calls = (m.tool_calls || r.tool_calls || []).map((c, i) => ({ id: c.id || 'c' + i, type: 'function', function: { name: c.function?.name || c.name, arguments: typeof (c.function?.arguments ?? c.arguments) === 'string' ? (c.function?.arguments ?? c.arguments) : JSON.stringify(c.function?.arguments ?? c.arguments ?? {}) } }));
  return { role: 'assistant', content: m.content ?? r.response ?? '', ...(calls.length ? { tool_calls: calls } : {}) };
};
