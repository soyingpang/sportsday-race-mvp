import { loadState, saveState, subscribeStateUpdates, onSave } from './store.js';
import { RemoteSync } from './remoteSync.js';
import { computeLeaderboard, normalizeTimeInput, parseCsv } from './logic.js';

let state = loadState();

// === diagnostics ===
const diagEl = document.getElementById('diag');
function diag(t){ if(diagEl) diagEl.textContent = t || ''; }
window.addEventListener('error', (e)=>diag(`⚠️ 系統錯誤：${e.message}`));

diag('✅ 系統已載入（JS OK）');

// admin quick controls
if(adminMode){
  const bar = document.createElement('div');
  bar.className='adminQuick';
  bar.innerHTML = `<button id="btnNextHeat" class="primary">下一場 ▶</button> <span class="muted" id="nextHint"></span>`;
  document.body.insertBefore(bar, document.body.firstChild.nextSibling);
  bar.querySelector('#btnNextHeat').addEventListener('click', ()=>{ gotoNextHeat(); render(); });
}


// 若未載入任何名單，預設自動載入既定名單（data/participants.sample.csv）
if(!state.participants?.length){
  try{
    const res = await fetch('./data/participants.sample.csv', {cache:'no-store'});
    if(res.ok){
      const csvText = await res.text();
      const parsed = parseCsv(csvText);
      state.participants = parsed;
      saveState(state);
    }
  }catch(e){ /* ignore */ }
}

// === remote sync (cross-device) ===
await RemoteSync.init();
onSave((st)=>RemoteSync.push(st));

// === helpers ===
const el = (id)=>document.getElementById(id);
const qs = new URLSearchParams(location.search);
const laneParam = Number(qs.get('lane') || 0);
const adminMode = qs.get('admin') === '1' || location.pathname.endsWith('admin.html');
const laneMode = laneParam >= 1 && laneParam <= 4;


// === navigation: next heat ===
function getHeatOrder(){
  // order by event name then heatNo
  const heats = (state.heats||[]).slice();
  heats.sort((a,b)=>{
    if(a.event!==b.event) return String(a.event).localeCompare(String(b.event),'zh-Hant');
    return (a.heatNo||0)-(b.heatNo||0);
  });
  return heats;
}
function gotoNextHeat(){
  const order = getHeatOrder();
  if(!order.length) return;
  const curId = state.currentHeatId || order[0].id;
  const idx = Math.max(0, order.findIndex(h=>h.id===curId));
  const next = order[Math.min(order.length-1, idx+1)];
  state.currentHeatId = next.id;
  saveState(state);
}


const laneModeRoot = el('laneMode');
const fullModeRoot = el('fullMode');
const scoreTitle = el('scoreTitle');

function pMap(){
  return Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
}

function currentHeat(){
  const id = state.ui?.currentHeatId;
  return (state.heats||[]).find(h=>h.id===id) || null;
}

function ensureResultObj(heatId){
  state.results = state.results || {};
  state.results[heatId] = state.results[heatId] || {};
  return state.results[heatId];
}

// === Lane mode UI ===
function initLaneMode(){
  if(!laneMode) return;
  if(laneModeRoot) laneModeRoot.hidden = false;
  if(fullModeRoot) fullModeRoot.hidden = true;
  if(scoreTitle) scoreTitle.textContent = `📲 Lane ${laneParam} 計分`;

  const laneBadge = el('laneBadge');
  const laneHeatLabel = el('laneHeatLabel');
  const laneName = el('laneName');
  const laneMeta = el('laneMeta');
  const laneTime = el('laneTime');
  const laneMsg = el('laneMsg');
  const btnSendOk = el('btnSendOk');
  const autoFollow = el('autoFollow');

  if(laneBadge) laneBadge.textContent = `Lane ${laneParam}`;

  function setMsg(t){ if(laneMsg) laneMsg.textContent = t || ''; }

  function render(){
    const h = currentHeat();
    const map = pMap();

    if(!h){
      if(laneHeatLabel) laneHeatLabel.textContent = '尚未指定目前組次（請後台按「設為目前組次」）';
      if(laneName) laneName.textContent = '—';
      if(laneMeta) laneMeta.textContent = '';
      if(laneTime) laneTime.value = '';
      setMsg('');
      return;
    }

    laneHeatLabel.textContent = `${h.grade}年級 ${h.event} ${h.round} 第${h.heatNo}組`;

    const laneObj = (h.lanes||[]).find(x=>Number(x.lane)===laneParam);
    const pid = laneObj?.pid || null;
    const p = pid ? map[pid] : null;

    laneName.textContent = p ? p.name : '（空道）';
    laneMeta.textContent = p ? `${p.class}　${p.no}號` : '';

    const r = state.results?.[h.id]?.[String(laneParam)] || null;
    if(r && r.status === 'OK' && typeof r.timeSec === 'number'){
      laneTime.value = String(r.timeSec);
      setMsg('✅ 已送出（OK）');
    }else if(r && r.status && r.status !== 'OK'){
      laneTime.value = '';
      setMsg(`✅ 已送出（${r.status}）`);
    }else{
      laneTime.value = '';
      setMsg('');
    }

    // focus for fast entry
    setTimeout(()=>{ laneTime?.focus(); laneTime?.select?.(); }, 30);
  }

  function commit({status='OK', timeSec=null}){
    const h = currentHeat();
    if(!h) return;

    const laneObj = (h.lanes||[]).find(x=>Number(x.lane)===laneParam);
    const pid = laneObj?.pid || null;

    const slot = ensureResultObj(h.id);
    if(status === 'CLEAR'){
      delete slot[String(laneParam)];
      saveState(state);
      setMsg('已清除。');
      render();
      return;
    }

    if(status === 'OK'){
      if(!pid){
        setMsg('此線道為空，無法送出 OK 成績。');
        return;
      }
      if(!(typeof timeSec === 'number') || !isFinite(timeSec)){
        setMsg('請輸入正確秒數。');
        return;
      }
      slot[String(laneParam)] = { pid, timeSec, status:'OK', note:'', updatedAt: Date.now() };
      saveState(state);
      setMsg('✅ 已送出（OK）');
      render();
      return;
    }

    // DNS/DNF/DQ can be submitted even if pid is null? We'll require pid.
    if(!pid){
      setMsg('此線道為空，無法送出狀態。');
      return;
    }
    slot[String(laneParam)] = { pid, timeSec:null, status, note:'', updatedAt: Date.now() };
    saveState(state);
    setMsg(`✅ 已送出（${status}）`);
    render();
  }

  btnSendOk?.addEventListener('click', ()=>{
    const t = normalizeTimeInput(laneTime?.value || '');
    commit({status:'OK', timeSec: t});
  });

  laneTime?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      e.preventDefault();
      const t = normalizeTimeInput(laneTime?.value || '');
      commit({status:'OK', timeSec: t});
    }
  });

  document.querySelectorAll('.laneStatus[data-status]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const s = btn.dataset.status;
      if(!s) return;
      if(s === 'CLEAR') commit({status:'CLEAR'});
      else commit({status:s});
    });
  });

  // Auto-follow: if disabled, we do not switch heat on remote updates; we still re-render if current heat changed by user.
  autoFollow?.addEventListener('change', ()=>{ /* no-op; read checked in onUpdate */ });

  subscribeStateUpdates((ev)=>{
    const prevHeat = state.ui?.currentHeatId;
    state = loadState();
    const nextHeat = state.ui?.currentHeatId;
    if(autoFollow?.checked){
      if(prevHeat !== nextHeat) render();
      else render(); // still refresh to reflect incoming results
    }else{
      // not following: only refresh results for same heat
      render();
    }
  });

  render();
}

// === Full mode (desktop) ===
function initFullMode(){
  if(laneMode) return;
  if(laneModeRoot) laneModeRoot.hidden = true;
  if(fullModeRoot) fullModeRoot.hidden = false;

  const selGrade = el('selGrade');
  const inpEvent = el('inpEvent');
  const selHeat = el('selHeat');
  const btnLoadHeat = el('btnLoadHeat');
  const btnFollowNow = el('btnFollowNow');
  const autoFollowFull = el('autoFollowFull');
  const pickMsg = el('pickMsg');
  const heatInfo = el('heatInfo');
  const laneForm = el('laneForm');
  const saveMsg = el('saveMsg');

  const setPickMsg = (t)=>{ if(pickMsg) pickMsg.textContent = t || ''; };
  const setSaveMsg = (t)=>{ if(saveMsg) saveMsg.textContent = t || ''; };

  function heatsOfContext(){
    const g = String(selGrade?.value || '');
    const e = String(inpEvent?.value || '').trim();
    return (state.heats||[]).filter(h=>String(h.grade)===g && h.event===e)
      .slice()
      .sort((a,b)=> (a.heatNo||0)-(b.heatNo||0) || (a.createdAt||0)-(b.createdAt||0));
  }

  function renderHeatOptions(){
    const heats = heatsOfContext();
    selHeat.innerHTML = heats.map(h=>`<option value="${h.id}">第${h.heatNo}組（${h.classA} vs ${h.classB}）</option>`).join('');
    if(!heats.length) setPickMsg('此條件下尚未建立組次。');
    else setPickMsg('');
  }

  function renderLaneForm(heatId){
    const h = (state.heats||[]).find(x=>x.id===heatId);
    if(!h){ laneForm.innerHTML=''; heatInfo.textContent=''; return; }

    heatInfo.textContent = `${h.grade}年級 ${h.event} ${h.round} 第${h.heatNo}組（A:${h.classA} / B:${h.classB}）`;

    const map = pMap();
    const slot = ensureResultObj(h.id);

    const rows = (h.lanes||[]).slice().sort((a,b)=>(a.lane||0)-(b.lane||0)).map(L=>{
      const p = L.pid ? map[L.pid] : null;
      const r = slot[String(L.lane)] || null;
      const timeVal = r && r.status==='OK' && typeof r.timeSec==='number' ? r.timeSec : '';
      const statusVal = r ? r.status : 'OK';
      return `
        <tr>
          <td>Lane ${L.lane}</td>
          <td>${p?`${p.class}`:(L.cls||'')}</td>
          <td>${p?`${p.no}. ${p.name}`:'（空）'}</td>
          <td><input data-k="time" data-lane="${L.lane}" value="${timeVal}" inputmode="decimal" placeholder="秒" style="width:110px"></td>
          <td>
            <select data-k="status" data-lane="${L.lane}">
              ${['OK','DNS','DNF','DQ'].map(s=>`<option value="${s}" ${s===statusVal?'selected':''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><input data-k="note" data-lane="${L.lane}" value="${r?.note||''}" placeholder="備註" style="width:180px"></td>
        </tr>`;
    }).join('');

    laneForm.innerHTML = `
      <table class="table">
        <thead><tr><th>線道</th><th>班別</th><th>選手</th><th>成績</th><th>狀態</th><th>備註</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function bindLaneInputs(heatId){
    laneForm.querySelectorAll('input,select').forEach(node=>{
      node.addEventListener('change', ()=>{
        const lane = String(node.dataset.lane||'');
        const k = node.dataset.k;
        const h = (state.heats||[]).find(x=>x.id===heatId);
        if(!h) return;

        const map = pMap();
        const laneObj = (h.lanes||[]).find(x=>String(x.lane)===lane);
        const pid = laneObj?.pid || null;
        if(!pid){ setSaveMsg('空道不需入分。'); return; }

        const slot = ensureResultObj(h.id);
        const cur = slot[lane] || { pid, status:'OK', timeSec:null, note:'', updatedAt: Date.now() };
        cur.pid = pid;

        if(k==='time'){
          cur.timeSec = normalizeTimeInput(node.value);
        }else if(k==='status'){
          cur.status = node.value;
          if(cur.status !== 'OK') cur.timeSec = null;
        }else if(k==='note'){
          cur.note = node.value;
        }
        cur.updatedAt = Date.now();
        slot[lane] = cur;
        saveState(state);
        setSaveMsg(`已儲存：Lane ${lane}`);
      });
    });
  }

  function loadSelectedHeat(){
    const id = selHeat.value;
    if(!id){ setPickMsg('請選擇組次。'); return; }
    renderLaneForm(id);
    bindLaneInputs(id);
  }

  btnLoadHeat?.addEventListener('click', loadSelectedHeat);
  btnFollowNow?.addEventListener('click', ()=>{
    const cur = currentHeat();
    if(!cur){ setPickMsg('尚未指定目前組次。'); return; }
    selGrade.value = String(cur.grade);
    inpEvent.value = cur.event;
    "" = cur.round;
    renderHeatOptions();
    selHeat.value = cur.id;
    loadSelectedHeat();
  });

  [selGrade, inpEvent].forEach(n=>n?.addEventListener('change', renderHeatOptions));
  inpEvent?.addEventListener('input', ()=>{ /* no auto */ });

  subscribeStateUpdates(()=>{
    const prev = state.ui?.currentHeatId;
    state = loadState();
    renderHeatOptions();
    if(autoFollowFull?.checked){
      const cur = currentHeat();
      if(cur && prev !== cur.id){
        selHeat.value = cur.id;
        loadSelectedHeat();
      }
    }
  });

  renderHeatOptions();
  // auto load current heat if exists
  const cur = currentHeat();
  if(cur){
    selGrade.value = String(cur.grade);
    inpEvent.value = cur.event;
    "" = cur.round;
    renderHeatOptions();
    selHeat.value = cur.id;
    loadSelectedHeat();
  }
}

initLaneMode();
initFullMode();
