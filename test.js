import { core } from './server.js';
const r = await core.plan({ loves: ['Vaishali', 'Kayani Bakery'], area: 'Koregaon Park', diet: 'veg', want: 'dosa' });
if (r.error || r.picks.length < 3) { console.error('FAIL', r.error || r.picks.length); process.exit(1); }
console.log('OK', r.anchors.map(a => a.name), r.crawl.map(c => c.name));
const bad = await core.plan({ loves: ['zzzqqq'] }); if (!bad.error) { console.error('FAIL no-error'); process.exit(1); }
console.log('OK error path'); process.exit(0);
