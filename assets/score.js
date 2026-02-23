import { loadState, saveState, subscribeStateUpdates } from './store.js';
import { computeLeaderboard, gradeOfClass, normalizeTimeInput } from './logic.js';

let state = loadState();

// === diagnostics ===
const diagEl = document.getElementById('diag');
function diag(t){ if(diagEl) diagEl.textContent = t || ''; }
window.addEventListener('error', (e)=>diag('⚠️ 系統錯誤：'+(e?.message||e)));
window.addEventListener('unhandledrejection', (e)=>diag('⚠️ 系統錯誤：'+(e?.reason?.message||e?.reason||e)));
diag('✅ 計分頁已載入（JS OK）');


const el = (id)=>document.getElementById(id);
const selGrade = el('selGrade');
const inpEvent = el('inpEvent');
const selRound = el('selRound');
const selHeat = el('selHeat');
const pickMsg = el('pickMsg');
const laneForm = el('laneForm');
const saveMsg = el('saveMsg');
const autoFollow = el('autoFollow');

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function heatsFiltered(){
  const grade = selGrade.value;
  const event = (inpEvent.value||'').trim();
  const round = selRound.value;
  return (state.heats||[])
    .filter(h=> String(h.grade)===String(grade) && String(h.event)===String(event) && String(h.round)===String(round))
    .sort((a,b)=> (a.heatNo||0)-(b.heatNo||0) || (a.createdAt||0)-(b.createdAt||0));
}

function renderHeatOptions({preserveHeatId=null} = {}){
  const hs = heatsFiltered();
  const prev = preserveHeatId ?? selHeat.value;

  selHeat.innerHTML = hs.map(h=>`<option value="${h.id}">第 ${h.heatNo} 組（${h.classA} vs ${h.classB}）</option>`).join('');
  pickMsg.textContent = hs.length ? `共 ${hs.length} 組` : '（找不到符合的組次）';

  // keep previous selection if still exists
  if(prev && hs.some(h=>h.id===prev)) selHeat.value = prev;

  renderLaneForm();
}

function pMap(){
  return Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
}

function ensureHeatResult(heatId){
  state.results = state.results || {};
  if(!state.results[heatId]) state.results[heatId] = {};
  return state.results[heatId];
}

function renderLaneForm(){
  const heatId = selHeat.value;
  const heat = (state.heats||[]).find(h=>h.id===heatId);
  if(!heat){
    laneForm.innerHTML = '<div class="muted">請先選擇組次。</div>';
    return;
  }
  const pm = pMap();
  const rHeat = ensureHeatResult(heatId);

  laneForm.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Lane</th><th>班級</th><th>姓名</th><th>成績(秒)</th><th>狀態</th><th>備註</th>
        </tr>
      </thead>
      <tbody>
        ${(heat.lanes||[]).map(L=>{
          const pid = L.pid;
          const p = pid ? pm[pid] : null;
          const cls = p ? p.class : (L.cls || '');
          const name = p ? p.name : '（空）';
          const rec = rHeat[String(L.lane)] || { pid: pid||null, timeSec: null, status:'OK', note:'' };
          const timeVal = (rec.timeSec===0 || rec.timeSec) ? rec.timeSec : '';
          const statusVal = (rec.status || 'OK').toUpperCase();
          const disabled = pid ? '' : 'disabled';
          return `
            <tr>
              <td>${L.lane}</td>
              <td>${escapeHtml(cls)}</td>
              <td>${escapeHtml(name)}</td>
              <td><input ${disabled} data-k="time" data-lane="${L.lane}" inputmode="decimal" value="${timeVal}" placeholder="例如 12.34" /></td>
              <td>
                <select ${disabled} data-k="status" data-lane="${L.lane}">
                  ${['OK','DNS','DNF','DQ'].map(s=>`<option value="${s}" ${s===statusVal?'selected':''}>${s}</option>`).join('')}
                </select>
              </td>
              <td><input ${disabled} data-k="note" data-lane="${L.lane}" value="${escapeHtml(rec.note||'')}" /></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // keyboard: Enter to next input
  laneForm.querySelectorAll('input,select').forEach((node, idx, all)=>{
    node.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        const nxt = all[idx+1];
        if(nxt) nxt.focus();
      }
    });
  });
}

function persistFromForm(){
  const heatId = selHeat.value;
  const heat = (state.heats||[]).find(h=>h.id===heatId);
  if(!heat) return;

  const rHeat = ensureHeatResult(heatId);
  const pm = pMap();

  // ensure each lane record carries pid
  for(const L of (heat.lanes||[])){
    if(!L.pid) continue;
    if(!rHeat[String(L.lane)]) rHeat[String(L.lane)] = { pid: L.pid, timeSec:null, status:'OK', note:'' };
    rHeat[String(L.lane)].pid = L.pid;
  }

  laneForm.querySelectorAll('[data-k]').forEach(node=>{
    const lane = String(node.dataset.lane);
    const k = node.dataset.k;
    if(!rHeat[lane]) rHeat[lane] = { pid:null, timeSec:null, status:'OK', note:'' };

    if(k === 'time'){
      rHeat[lane].timeSec = normalizeTimeInput(node.value);
      if(rHeat[lane].timeSec !== null) rHeat[lane].status = 'OK';
    }else if(k === 'status'){
      rHeat[lane].status = String(node.value||'OK').toUpperCase();
      if(rHeat[lane].status !== 'OK') rHeat[lane].timeSec = null;
    }else if(k === 'note'){
      rHeat[lane].note = String(node.value||'');
    }
    rHeat[lane].updatedAt = Date.now();
  });

  saveState(state);
  saveMsg.textContent = `已儲存（${new Date().toLocaleTimeString('zh-Hant-TW',{hour12:false})}）`;
}

laneForm.addEventListener('input', (e)=>{
  if(e.target?.dataset?.k) persistFromForm();
});
laneForm.addEventListener('change', (e)=>{
  if(e.target?.dataset?.k) persistFromForm();
});

document.getElementById('btnClearHeat')?.addEventListener('click', ()=>{
  const heatId = selHeat.value;
  if(!heatId) return;
  if(confirm('確定要清除此組成績？')){
    state.results = state.results || {};
    delete state.results[heatId];
    saveState(state);
    renderLaneForm();
  }
});

function followCurrentHeat(){
  const curId = state.ui?.currentHeatId;
  const h = (state.heats||[]).find(x=>x.id===curId);
  if(!h) return false;
  selGrade.value = String(h.grade);
  inpEvent.value = h.event;
  selRound.value = h.round;
  renderHeatOptions({preserveHeatId: h.id});
  selHeat.value = h.id;
  renderLaneForm();
  return true;
}

document.getElementById('btnFollowCurrent')?.addEventListener('click', ()=>{
  const curId = state.ui?.currentHeatId;
  const h = (state.heats||[]).find(x=>x.id===curId);
  if(!h){ pickMsg.textContent = '看板尚未指定目前組次。'; return; }
  selGrade.value = String(h.grade);
  inpEvent.value = h.event;
  selRound.value = h.round;
  if(autoFollow?.checked){
  if(!followCurrentHeat()) renderHeatOptions();
}else{
  renderHeatOptions();
}

  selHeat.value = h.id;
  renderLaneForm();
});

selGrade.addEventListener('change', renderHeatOptions);
inpEvent.addEventListener('change', renderHeatOptions);
selRound.addEventListener('change', renderHeatOptions);
selHeat.addEventListener('change', renderLaneForm);

if(autoFollow?.checked){
  if(!followCurrentHeat()) renderHeatOptions();
}else{
  renderHeatOptions();
}



subscribeStateUpdates(()=>{
  const follow = document.getElementById('chkFollowCurrent')?.checked;
  const prev = document.getElementById('selHeat')?.value;
  state = loadState();
  if(!follow && prev){
    renderHeatOptions();
    document.getElementById('selHeat').value = prev;
    renderLaneForm();
  }else{
    // follow current or no prev
    renderHeatOptions();
  }
});
