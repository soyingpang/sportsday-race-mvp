import { loadState, subscribeStateUpdates } from './store.js';
import { computeLeaderboard } from './logic.js';

let state = loadState();

const el = (id)=>document.getElementById(id);
const clock = el('clock');
const currentHeat = el('currentHeat');
const nextHeat = el('nextHeat');
const leaderboard = el('leaderboard');

function byId(arr){ return Object.fromEntries(arr.map(x=>[x.id,x])); }

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function render(){
  const pMap = byId(state.participants);
  const heats = state.heats.slice().sort((a,b)=>a.createdAt-b.createdAt);
  const curId = state.ui.currentHeatId;
  const curIdx = heats.findIndex(h=>h.id===curId);
  const cur = curIdx>=0 ? heats[curIdx] : null;
  const nxt = curIdx>=0 ? heats[curIdx+1] : (heats[0] || null);

  currentHeat.innerHTML = cur ? heatHtml(cur,pMap,'big') : '<div class="muted">尚未指定目前組次。</div>';
  nextHeat.innerHTML = nxt ? heatHtml(nxt,pMap,'') : '<div class="muted">（無）</div>';
  // leaderboard follows current heat's event/round/grade
  if(leaderboard){
    if(cur){
      const rows = computeLeaderboard(state, {grade:cur.grade, event:cur.event, round:cur.round});
      const topN = rows.slice(0, 8);
      leaderboard.innerHTML = topN.length ? `
        <table class="table">
          <thead><tr><th>#</th><th>班級</th><th>姓名</th><th>成績</th></tr></thead>
          <tbody>
            ${topN.map(r=>{
              const score = r.status==='OK' && (r.timeSec===0 || r.timeSec) ? String(r.timeSec) : r.status;
              const rk = r.rank ?? '-';
              return `<tr><td>${rk}</td><td>${escapeHtml(r.class)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(score)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      ` : '<div class="muted">尚無成績。</div>';
    }else{
      leaderboard.innerHTML = '<div class="muted">尚未指定目前組次。</div>';
    }
  }
}

function heatHtml(h, pMap, cls){
  return `
    <div class="${cls}">
      <div class="row">
        <span class="badge">${h.grade}年級</span>
        <span class="badge">${escapeHtml(h.event)}</span>
        <span class="badge">${escapeHtml(h.round)}</span>
        <span class="badge">第 ${h.heatNo} 組</span>
      </div>
      <div class="muted">A: ${escapeHtml(h.classA)}　B: ${escapeHtml(h.classB)}</div>
      <div class="lanes" style="margin-top:10px">
        ${h.lanes.map(L=>{
          const p = L.pid ? pMap[L.pid] : null;
          const name = p ? p.name : '（空）';
          const c = p ? p.class : (L.cls || '');
          return `
            <div class="lane">
              <div class="n">Lane ${L.lane}</div>
              <div class="p">${escapeHtml(name)}</div>
              <div class="c">${escapeHtml(c)}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function tick(){
  const d = new Date();
  clock.textContent = d.toLocaleString('zh-Hant-TW', { hour12:false });
}
setInterval(tick, 1000); tick();


subscribeStateUpdates(()=>{
  state = loadState();
  render();
});

render();
