const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const card=(p,slot)=>`<div class="card">${slot?`<div class="slot">${esc(slot)}</div>`:''}<h3>${esc(p.name)}${p.rating?` <small>★ ${p.rating.toFixed(1)}</small>`:''}</h3>
<div>${esc(p.address)}</div>${p.description?`<p>${esc(p.description)}</p>`:''}<div>${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${p.query_fit===false?'<span class="tag">taste match only - Qloo data does not mention your craving</span>':''}</div>
<p class="why">${p.why.map(esc).join(' · ')}</p><a href="${esc(p.map)}" target="_blank" rel="noopener">Open in Maps</a></div>`;
$('f').onsubmit=async e=>{e.preventDefault();const o=$('out');o.textContent='Reading the taste graph...';
 try{const r=await fetch('/api/plan',{method:'POST',body:JSON.stringify({loves:$('loves').value.split(',').map(s=>s.trim()).filter(Boolean),area:$('area').value,want:$('want').value,diet:$('diet').value,budget:$('budget').value})});
 const d=await r.json();if(d.error){o.innerHTML=`<p class="err">${esc(d.error)}</p>`;return}
 o.innerHTML=`<h2>Your crawl around ${esc(d.area)}</h2><p class="why">Anchors: ${d.anchors.map(a=>esc(a.name)).join(', ')}. ${esc(d.note)}</p>`+d.crawl.map(p=>card(p,p.slot)).join('')+`<h2>More picks</h2>`+d.picks.slice(3).map(p=>card(p)).join('')}
 catch{o.innerHTML='<p class="err">Network error. Try again.</p>'}};

document.getElementById('af').onsubmit=async e=>{e.preventDefault();const o=document.getElementById('aout');o.textContent='The agent is working...';
 try{const r=await fetch('/api/agent',{method:'POST',body:JSON.stringify({text:document.getElementById('atext').value})});const d=await r.json();
 if(!r.ok){o.innerHTML='<div class="card"><span class="badge">AI agent unavailable</span><p>'+(d.error==='agent_unavailable'?'The AI agent is not enabled in this build.':'The AI agent could not finish this request.')+' The rule-based planner above still works, but it is not the AI agent.</p></div>';return}
 o.innerHTML='<div class="card"><span class="badge">AI agent</span>'+d.places.map(p=>'<div class="card"><b>'+esc(p.name)+'</b><br>'+esc(p.address||'')+'<br>'+(p.rating?'Rated '+Number(p.rating).toFixed(1)+' · ':'')+esc(p.cost_band||'')+'<ul>'+(p.reasons||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+(p.query_fit===false?'<p class="steps">Taste match only - Qloo data does not mention your craving.</p>':'')+(p.commentary?'<p class="steps">AI commentary (unverified): '+esc(p.commentary)+'</p>':'')+'</div>').join('')+'<p class="steps">Steps: '+d.trace.map(t=>esc(t.tool)).join(' > ')+' (Qloo API calls)</p><p class="steps">Note: agent picks are Qloo taste matches and are NOT checked against your craving keywords; craving-fit badges appear only in the rule-based planner.</p></div>'}
 catch{o.innerHTML='<p class="err">Network error. Try again.</p>'}};
