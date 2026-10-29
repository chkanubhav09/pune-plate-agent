// Local Node server using the shared core. Env from .env. LLM optional (OpenAI-compatible endpoint).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createCore, runAgent, openAiCompatLlm } from './core.js';
const dir = path.dirname(fileURLToPath(import.meta.url));
try { for (const l of fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n')) { const m = l.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
const core = createCore(process.env);
const llmOn = !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const body = async req => { let b = ''; for await (const c of req) b += c; return JSON.parse(b || '{}'); };
const send = (res, s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
export const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/plan' && req.method === 'POST') { try { const o = await core.plan(await body(req)); send(res, o.error ? 422 : 200, o); } catch { send(res, 502, { error: 'Taste service unavailable, try again.' }); } return; }
  if (u.pathname === '/api/agent' && req.method === 'POST') {
    if (!llmOn) return send(res, 503, { error: 'agent_unavailable' });
    try { const { text } = await body(req); if (!text || text.length > 500) return send(res, 422, { error: 'Send a request under 500 characters.' });
      send(res, 200, { mode: 'agent', model: process.env.LLM_MODEL, ...(await runAgent(text, core.impl, openAiCompatLlm(process.env))) }); } catch (e) { send(res, 502, { error: 'agent_failed', detail: String(e.message || e).slice(0, 80) }); } return; }
  const f = path.join(dir, 'public', u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('Not found'); } else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(process.env.PORT || 3000, () => console.log('Pune Plate Agent on', process.env.PORT || 3000));
export { core };
