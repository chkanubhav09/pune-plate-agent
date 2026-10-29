// Cloudflare Worker entry. Static files are inlined in static-assets.js (generated from public/). Secrets: QLOO_API_KEY. Binding: AI.
import { createCore, runAgent, workersAiLlm } from './core.js';
import { STATIC } from './static-assets.js';
const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
export default {
  async fetch(req, env) {
    const u = new URL(req.url); const core = createCore(env);
    if (req.method === 'POST' && u.pathname === '/api/plan') {
      try { const out = await core.plan(await req.json()); return json(out, out.error ? 422 : 200); } catch { return json({ error: 'Taste service unavailable, try again.' }, 502); }
    }
    if (req.method === 'POST' && u.pathname === '/api/agent') {
      if (!env.AI) return json({ error: 'agent_unavailable' }, 503);
      try { const { text } = await req.json(); if (!text || text.length > 500) return json({ error: 'Send a request under 500 characters.' }, 422);
        return json({ mode: 'agent', model: MODEL, ...(await runAgent(text, core.impl, workersAiLlm(env, MODEL))) }); }
      catch (e) { return json({ error: 'agent_failed', detail: String(e.message || e).slice(0, 500) }, 502); }
    }
    const a = STATIC[u.pathname]; return a ? new Response(a.body, { headers: { 'content-type': a.type } }) : new Response('Not found', { status: 404 });
  } };
