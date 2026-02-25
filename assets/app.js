import { loadState, saveState, resetState } from './store.js';
import { exportScheduleCsv, exportTotalTimesCsv } from './export.js';
import { parseCsv, gradeOfClass, laneAssign, makeHeatId, normalizeTimeInput, computeAllTotals } from './logic.js';

let state = loadState();

// === diagnostics ===
const diagEl = document.getElementById('diag');
function diag(text){ if(diagEl) diagEl.textContent = text || ''; }
window.addEventListener('error', (e)=>diag('⚠️ 系統錯誤：' + (e?.message || e)));
window.addEventListener('unhandledrejection', (e)=>diag('⚠️ 系統錯誤：' + (e?.reason?.message || e?.reason || e)));
diag('✅ 系統已載入（本機模式）');

// === dom helpers ===
const el = (id)=>document.getElementById(id);
const fileCsv = el('fileCsv');
const importMsg = el('importMsg');
const participantsSummary = el('participantsSummary');

const selGrade = el('selGrade');
const selClassA = el('selClassA');
const selClassB = el('selClassB');
const inpEvent = el('inpEvent');
const selRound = el('selRound');
const inpHeatNo = el('inpHeatNo');
const pickA = el('pickA');
const pickB = el('pickB');
const selFill = el('selFill');
const chkAutoHeats = el('chkAutoHeats');
const btnAutoHeats = el('btnAutoHeats');
const createMsg = el('createMsg');
const heatsList = el('heatsList');
const heatsOverview = el('heatsOverview');

const btnExportSchedule = el('btnExportSchedule');
const exportMsg1 = el('exportMsg1');

const gLabel1 = el('gLabel1');
const gLabel2 = el('gLabel2');
const gLabel3 = el('gLabel3');
const btnSaveLabels = el('btnSaveLabels');
const labelMsg = el('labelMsg');
const selGradeScore = el('selGradeScore');
const scoreTable = el('scoreTable');
const btnExportTotalCsv = el('btnExportTotalCsv');
const exportMsg2 = el('exportMsg2');

function setMsg(node, text){ if(node) node.textContent = text || ''; }
function byId(arr){ return Object.fromEntries(arr.map(x=>[x.id,x])); }
function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

// === reset ===
el('btnReset')?.addEventListener('click', ()=>{
  if(confirm('確定要清空此瀏覽器資料？')){
    resetState();
    state = loadState();
    renderAll();
  }
});

// === Import ===
async function importCsvText(text){
  const {records} = parseCsv(text);
  if(!records.length){
    setMsg(importMsg, '匯入失敗：沒有讀到資料列。');
    return;
  }
  state.participants = records;
  // backfill missing game records
  state.games = state.games || {labels:['遊戲1','遊戲2','遊戲3'], times:{}};
  state.games.times = state.games.times || {};
  for(const p of records){
    if(!state.games.times[p.id]) state.games.times[p.id] = {t1:null,t2:null,t3:null,note:''};
  }
  saveState(state);
  setMsg(importMsg, `已匯入 ${records.length} 筆名單。`);
  renderAll();
}

fileCsv?.addEventListener('change', async ()=>{
  const f = fileCsv.files?.[0];
  if(!f) return;
  const text = await f.text();
  importCsvText(text);
});

el('btnLoadSample')?.addEventListener('click', async ()=>{
  // 本機模式仍可用：sample 跟著專案，需 http.server 開啟
  const res = await fetch('./data/participants.sample.csv', {cache:'no-store'});
  const text = await res.text();
  importCsvText(text);
});

// === Schedule build ===
function classesOfGrade(grade){
  const set = new Set((state.participants||[])
    .filter(p=>gradeOfClass(p.class)===String(grade) && p.present)
    .map(p=>p.class));
  return Array.from(set).sort();
}

function renderClassOptions(){
  const grade = selGrade.value;
  const classes = classesOfGrade(grade);
  selClassA.innerHTML = classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  selClassB.innerHTML = classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(selClassB.value === selClassA.value && classes.length>1) selClassB.value = classes[1];
  renderPickers();
}

function renderBulkControls(grp){
  return `
    <div class="row" style="margin:6px 0 8px 0">
      <button type="button" data-bulk="${grp}" data-act="all">全選</button>
      <button type="button" data-bulk="${grp}" data-act="none">全不選</button>
      <button type="button" data-bulk="${grp}" data-act="top2">取前2位</button>
      <span class="muted" data-count="${grp}"></span>
    </div>`;
}

function renderPickers(){
  const classA = selClassA.value;
  const classB = selClassB.value;

  const listA = (state.participants||[]).filter(p=>p.class===classA && p.present).sort((a,b)=>a.no-b.no);
  const listB = (state.participants||[]).filter(p=>p.class===classB && p.present).sort((a,b)=>a.no-b.no);

  const mk = (p, grp)=>`
    <label>
      <input type="checkbox" data-grp="${grp}" value="${p.id}" />
      <span>${p.no}. ${escapeHtml(p.name)}</span>
    </label>`;

  pickA.innerHTML = (listA.length ? (renderBulkControls('A') + listA.map(p=>mk(p,'A')).join('')) : '<div class="muted">（無資料）</div>');
  pickB.innerHTML = (listB.length ? (renderBulkControls('B') + listB.map(p=>mk(p,'B')).join('')) : '<div class="muted">（無資料）</div>');

  function updateCount(root, grp){
    const checked = root.querySelectorAll('input[type=checkbox]:checked').length;
    const node = root.querySelector(`[data-count="${grp}"]`);
    if(node) node.textContent = `已選 ${checked} 位（建立場次只取前2位）`;
  }

  [pickA, pickB].forEach(root=>{
    root.addEventListener('click', e=>{
      const btn = e.target.closest('button[data-bulk]');
      if(!btn) return;
      const grp = btn.dataset.bulk;
      const act = btn.dataset.act;
      const boxes = root.querySelectorAll('input[type=checkbox]');
      if(act === 'all') boxes.forEach(b=>b.checked = true);
      if(act === 'none') boxes.forEach(b=>b.checked = false);
      if(act === 'top2') boxes.forEach((b,i)=>b.checked = i < 2);
      updateCount(root, grp);
    });
    root.addEventListener('change', e=>{
      const grp = e.target?.dataset?.grp;
      if(!grp) return;
      updateCount(root, grp);
    });
  });

  updateCount(pickA, 'A');
  updateCount(pickB, 'B');
}

function renderParticipantsSummary(){
  if(!(state.participants||[]).length){
    participantsSummary.innerHTML = '<div class="muted">尚未匯入名單。</div>';
    return;
  }
  const byClass = {};
  for(const p of state.participants){
    if(!p.present) continue;
    byClass[p.class] = (byClass[p.class]||0)+1;
  }
  const lines = Object.entries(byClass)
    .sort((a,b)=>a[0].localeCompare(b[0], 'zh-Hant'))
    .map(([c,n])=>`${c}: ${n} 人`).join('\n');
  const total = Object.values(byClass).reduce((a,b)=>a+b,0);
  participantsSummary.textContent = `${lines}\n\n合計：${total} 人（出席）`;
}

function renderHeatsOverview(pMap){
  if(!heatsOverview) return;
  if(!state.heats?.length){
    heatsOverview.innerHTML = '';
    return;
  }
  const heats = state.heats.slice().sort((a,b)=>
    String(a.grade).localeCompare(String(b.grade)) ||
    String(a.event).localeCompare(String(b.event),'zh-Hant') ||
    String(a.round).localeCompare(String(b.round),'zh-Hant') ||
    (a.heatNo||0)-(b.heatNo||0)
  );

  const laneCell = (L)=>{
    const p = L?.pid ? pMap[L.pid] : null;
    const n = p ? p.name : '（空）';
    const c = p ? p.class : (L?.cls||'');
    return `${escapeHtml(c)} ${escapeHtml(n)}`.trim();
  };

  heatsOverview.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>目前</th>
          <th>年級</th><th>項目</th><th>輪次</th><th>場次</th><th>A班</th><th>B班</th>
          <th>Lane1</th><th>Lane2</th><th>Lane3</th><th>Lane4</th>
        </tr>
      </thead>
      <tbody>
        ${heats.map(h=>{
          const isCurrent = state.ui.currentHeatId === h.id;
          return `
            <tr>
              <td><button data-act="setCurrent" data-id="${h.id}">${isCurrent?'✅':'設為'}</button></td>
              <td>${h.grade}</td>
              <td>${escapeHtml(h.event)}</td>
              <td>${escapeHtml(h.round)}</td>
              <td>${h.heatNo}</td>
              <td>${escapeHtml(h.classA)}</td>
              <td>${escapeHtml(h.classB)}</td>
              <td>${laneCell(h.lanes?.[0])}</td>
              <td>${laneCell(h.lanes?.[1])}</td>
              <td>${laneCell(h.lanes?.[2])}</td>
              <td>${laneCell(h.lanes?.[3])}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="muted">提示：看板會用「目前場次」往後推算黎緊三隊。</div>
  `;

  heatsOverview.querySelectorAll('button[data-act="setCurrent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.ui.currentHeatId = btn.dataset.id;
      saveState(state);
      renderHeats();
      setMsg(createMsg, '已設定目前場次（看板會更新黎緊三隊）。');
    });
  });
}

function renderHeats(){
  const pMap = byId(state.participants||[]);
  renderHeatsOverview(pMap);

  if(!state.heats?.length){
    heatsList.innerHTML = '<div class="muted">尚未建立任何場次。</div>';
    return;
  }

  // keep list minimal (delete / lock not needed for now)
  heatsList.innerHTML = '<div class="muted">（此版本不提供鎖定/重排；若要恢復可再加回。）</div>';
}

function createHeats({all}){
  const grade = selGrade.value;
  const classA = selClassA.value;
  const classB = selClassB.value;

  if(!(state.participants||[]).length){
    setMsg(createMsg, '請先匯入名單。'); return;
  }
  if(!classA || !classB){ setMsg(createMsg, '請選擇兩個班級。'); return; }
  if(classA === classB){ setMsg(createMsg, 'A 班與 B 班不可相同。'); return; }
  if(gradeOfClass(classA) !== String(grade) || gradeOfClass(classB) !== String(grade)){
    setMsg(createMsg, '年級不符合：1年級與2年級不可混賽。'); return;
  }

  const pickedAAllRaw = Array.from(pickA.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
  const pickedBAllRaw = Array.from(pickB.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);

  if(pickedAAllRaw.length + pickedBAllRaw.length === 0){
    setMsg(createMsg, '請先用「全選 / 取前2位」或自行勾選名單。'); return;
  }

  const pMap = byId(state.participants);
  const sortByNo = (ids)=> ids.filter(id=>pMap[id]).slice().sort((a,b)=>{
    const pa=pMap[a], pb=pMap[b];
    return (pa.no - pb.no) || String(pa.name).localeCompare(String(pb.name), 'zh-Hant');
  });

  const pickedAAll = sortByNo(pickedAAllRaw);
  const pickedBAll = sortByNo(pickedBAllRaw);

  const fillStrategy = selFill.value;

  const addHeat = (heatNo, pickedA, pickedB)=>{
    const h = {
      grade: String(grade),
      event: String(inpEvent.value||'').trim() || '遊戲',
      round: String(selRound.value||'').trim() || '預賽',
      heatNo: Number(heatNo||1),
      classA, classB,
      pickedA, pickedB,
      fillStrategy,
    };
    h.lanes = laneAssign({classA, classB, pickedA, pickedB, fillStrategy});
    h.id = makeHeatId(h);
    return h;
  };

  state.heats = state.heats || [];

  if(!all){
    const heatNo = Number(inpHeatNo.value || 1);
    const h = addHeat(heatNo, pickedAAll.slice(0,2), pickedBAll.slice(0,2));
    // upsert by id
    const idx = state.heats.findIndex(x=>x.id===h.id);
    if(idx>=0) state.heats[idx] = h; else state.heats.push(h);
    state.ui.currentHeatId = h.id;
    saveState(state);
    setMsg(createMsg, `已建立：第 ${h.heatNo} 場（並設為目前場次）`);
    renderHeats();
    return;
  }

  // Auto multiple heats: each heat consumes 2 per class
  const totalHeats = Math.max(Math.ceil(pickedAAll.length/2), Math.ceil(pickedBAll.length/2));
  const start = 1;
  for(let i=0;i<totalHeats;i++){
    const h = addHeat(start+i, pickedAAll.slice(i*2,i*2+2), pickedBAll.slice(i*2,i*2+2));
    const idx = state.heats.findIndex(x=>x.id===h.id);
    if(idx>=0) state.heats[idx] = h; else state.heats.push(h);
  }
  // set current to first of this context
  const first = addHeat(start, pickedAAll.slice(0,2), pickedBAll.slice(0,2));
  state.ui.currentHeatId = first.id;

  saveState(state);
  setMsg(createMsg, `已自動建立 ${totalHeats} 場（並設為第 1 場為目前場次）`);
  renderHeats();
}

el('btnCreateHeat')?.addEventListener('click', ()=>{
  const autoAll = !!chkAutoHeats?.checked;
  createHeats({all: autoAll});
});
btnAutoHeats?.addEventListener('click', ()=>createHeats({all:true}));

selGrade?.addEventListener('change', renderClassOptions);
selClassA?.addEventListener('change', ()=>{ if(selClassB.value===selClassA.value) renderClassOptions(); else renderPickers(); });
selClassB?.addEventListener('change', ()=>{ if(selClassB.value===selClassA.value) renderClassOptions(); else renderPickers(); });

// Export schedule
btnExportSchedule?.addEventListener('click', ()=>{
  if(!state.heats?.length){ setMsg(exportMsg1, '尚未建立任何賽程。'); return; }
  exportScheduleCsv(state);
  setMsg(exportMsg1, '已下載賽程表 CSV。');
});

// === Backend time entry (3 games) ===
function syncLabelsToUI(){
  const labels = state.games?.labels || ['遊戲1','遊戲2','遊戲3'];
  if(gLabel1) gLabel1.value = labels[0] || '遊戲1';
  if(gLabel2) gLabel2.value = labels[1] || '遊戲2';
  if(gLabel3) gLabel3.value = labels[2] || '遊戲3';
}

function saveLabelsFromUI(){
  const a = (gLabel1?.value || '遊戲1').trim() || '遊戲1';
  const b = (gLabel2?.value || '遊戲2').trim() || '遊戲2';
  const c = (gLabel3?.value || '遊戲3').trim() || '遊戲3';
  state.games = state.games || {labels:[a,b,c], times:{}};
  state.games.labels = [a,b,c];
  saveState(state);
  setMsg(labelMsg, '已儲存遊戲名稱。');
  renderScoreTable();
}

btnSaveLabels?.addEventListener('click', saveLabelsFromUI);

function ensureGameRec(pid){
  state.games = state.games || {labels:['遊戲1','遊戲2','遊戲3'], times:{}};
  state.games.times = state.games.times || {};
  if(!state.games.times[pid]) state.games.times[pid] = {t1:null,t2:null,t3:null,note:''};
  return state.games.times[pid];
}

function renderScoreTable(){
  if(!scoreTable) return;
  if(!(state.participants||[]).length){
    scoreTable.innerHTML = '<div class="muted">請先匯入名單。</div>';
    return;
  }

  const labels = state.games?.labels || ['遊戲1','遊戲2','遊戲3'];
  const grade = String(selGradeScore?.value || '1');
  const people = (state.participants||[]).filter(p=>p.present && gradeOfClass(p.class)===grade)
    .slice()
    .sort((a,b)=> String(a.class).localeCompare(String(b.class),'zh-Hant') || (a.no||0)-(b.no||0));

  // build table
  const rowsHtml = people.map(p=>{
    const rec = ensureGameRec(p.id);
    const t1 = (typeof rec.t1==='number') ? rec.t1 : '';
    const t2 = (typeof rec.t2==='number') ? rec.t2 : '';
    const t3 = (typeof rec.t3==='number') ? rec.t3 : '';
    const complete = (t1!=='' && t2!=='' && t3!=='');
    const total = complete ? (Number(t1)+Number(t2)+Number(t3)).toFixed(2) : '';
    return `
      <tr>
        <td>${escapeHtml(p.class)}</td>
        <td>${p.no||''}</td>
        <td>${escapeHtml(p.name)}</td>
        <td><input data-pid="${p.id}" data-k="t1" value="${t1}" inputmode="decimal" placeholder="秒" style="width:110px"></td>
        <td><input data-pid="${p.id}" data-k="t2" value="${t2}" inputmode="decimal" placeholder="秒" style="width:110px"></td>
        <td><input data-pid="${p.id}" data-k="t3" value="${t3}" inputmode="decimal" placeholder="秒" style="width:110px"></td>
        <td class="mono">${escapeHtml(total)}</td>
        <td><input data-pid="${p.id}" data-k="note" value="${escapeHtml(rec.note||'')}" placeholder="備註" style="width:180px"></td>
      </tr>
    `;
  }).join('');

  scoreTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>班別</th><th>座號</th><th>姓名</th>
          <th>${escapeHtml(labels[0])}(秒)</th>
          <th>${escapeHtml(labels[1])}(秒)</th>
          <th>${escapeHtml(labels[2])}(秒)</th>
          <th>總時間</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  // bind inputs (auto-save)
  scoreTable.querySelectorAll('input[data-pid]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const pid = inp.dataset.pid;
      const k = inp.dataset.k;
      const rec = ensureGameRec(pid);
      if(k === 'note'){
        rec.note = inp.value || '';
      }else{
        const t = normalizeTimeInput(inp.value);
        rec[k] = t;
        if(t === null) inp.value = ''; // normalize
      }
      saveState(state);
      renderScoreTable(); // refresh totals
    });
  });
}

selGradeScore?.addEventListener('change', renderScoreTable);

btnExportTotalCsv?.addEventListener('click', ()=>{
  if(!(state.participants||[]).length){ setMsg(exportMsg2, '請先匯入名單。'); return; }
  exportTotalTimesCsv(state);
  setMsg(exportMsg2, '已下載計分總表 CSV。');
});

// === render all ===
function renderAll(){
  renderParticipantsSummary();
  renderClassOptions();
  renderHeats();
  syncLabelsToUI();
  renderScoreTable();
}

renderAll();
