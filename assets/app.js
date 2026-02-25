import { loadState, saveState, resetState, subscribeStateUpdates, onSave } from './store.js';
import { parseCsv, gradeOfClass, laneAssign, makeHeatId } from './logic.js';
import { exportBackupJSON, exportLaneSheetCSV, exportResultsCSV } from './export.js';
let state = loadState();

// === diagnostics ===
const diagEl = document.getElementById('diag');
function diag(text){
  if(diagEl) diagEl.textContent = text || '';
}
window.addEventListener('error', (e)=>{
  diag('⚠️ 系統錯誤：' + (e?.message || e));
});
window.addEventListener('unhandledrejection', (e)=>{
  diag('⚠️ 系統錯誤：' + (e?.reason?.message || e?.reason || e));
});
diag('✅ 系統已載入（JS OK）');


const el = (id)=>document.getElementById(id);
const fileCsv = el('fileCsv');
const importMsg = el('importMsg');
const participantsSummary = el('participantsSummary');
const inpEvent = el('inpEvent');
const selFill = el('selFill');
const chkRebuild = el('chkRebuild');
const btnBuildAll = el('btnBuildAll');
const createMsg = el('createMsg');
const heatsList = el('heatsList');
const heatsOverview = el('heatsOverview');
const btnExportBackup = el('btnExportBackup');
const btnExportLane = el('btnExportLane');
const btnExportResults = el('btnExportResults');

function setMsg(node, text){ node.textContent = text || ''; }



btnExportBackup?.addEventListener('click', ()=>{
  exportBackupJSON(state);
});

btnExportLane?.addEventListener('click', ()=>{
  exportLaneSheetCSV(state);
});
btnExportResults?.addEventListener('click', ()=>{
  exportResultsCSV(state);
});

// === Create schedule (one-click) ===
btnBuildAll?.addEventListener('click', ()=>{
  try{
    const event = inpEvent?.value || '徑賽';
    const fillStrategy = selFill?.value || 'keep'; // keep | other
    const round = '預賽';
    const rebuild = chkRebuild ? !!chkRebuild.checked : true;

    const {heats, msg} = buildHeatsFromRoster({ event, round, fillStrategy });

    if(!heats.length){
      setMsg(createMsg, '⚠️ 無法建立：名單不足或未匯入。');
      return;
    }

    if(rebuild){
      // Clear all heats/results for selected event (simple & safe for one-off day)
      const keepHeats = state.heats.filter(h=>h.event !== event);
      state.heats = keepHeats.concat(heats);
      // Remove results for removed heats
      const keepIds = new Set(state.heats.map(h=>h.id));
      const nextResults = {};
      for(const [hid, r] of Object.entries(state.results||{})){
        if(keepIds.has(hid)) nextResults[hid] = r;
      }
      state.results = nextResults;
    }else{
      state.heats = state.heats.concat(heats);
    }

    // Set current heat if none
    if(!state.ui.currentHeatId && state.heats.length){
      state.ui.currentHeatId = state.heats[0].id;
    }
    state.updatedAt = Date.now();
    saveState(state);

    setMsg(createMsg, '✅ 已建立：' + msg);
    renderAll();
  }catch(err){
    console.error(err);
    setMsg(createMsg, '⚠️ 建立失敗：' + (err?.message || err));
  }
});

function buildHeatsFromRoster({event, round, fillStrategy}){
  const roster = (state.participants||[]).filter(p=>p.present);
  if(!roster.length) return {heats:[], msg:'名單為空'};

  // group by grade -> class
  const gradeMap = new Map(); // grade -> Map(class -> participants[])
  for(const p of roster){
    const g = gradeOfClass(p.class);
    if(!g) continue;
    if(!gradeMap.has(g)) gradeMap.set(g, new Map());
    const cm = gradeMap.get(g);
    if(!cm.has(p.class)) cm.set(p.class, []);
    cm.get(p.class).push(p);
  }
  // stable order in each class: by no then id
  for(const cm of gradeMap.values()){
    for(const [cls, arr] of cm.entries()){
      arr.sort((a,b)=>(a.no-b.no) || String(a.id).localeCompare(String(b.id)));
      cm.set(cls, arr);
    }
  }

  const heats = [];
  const now = Date.now();
  let createdSeq = 0;
  const grades = Array.from(gradeMap.keys()).sort((a,b)=>Number(a)-Number(b));

  for(const grade of grades){
    const cm = gradeMap.get(grade);
    const classes = Array.from(cm.keys()).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
    // pair classes: (A,B), (C,D)... by suffix order; fallback to sequential if unknown
    const parsed = classes.map(cls=>{
      const m = String(cls).match(/^(\d+)(.*)$/);
      return {cls, g:m?m[1]:'', suf:(m?m[2]:'')};
    }).sort((a,b)=>{
      if(a.g!==b.g) return Number(a.g)-Number(b.g);
      return String(a.suf).localeCompare(String(b.suf),'zh-Hant');
    });

    const pairs = [];
    for(let i=0;i<parsed.length;i+=2){
      const A = parsed[i]?.cls || '';
      const B = parsed[i+1]?.cls || '';
      if(!A) continue;
      pairs.push([A,B]);
    }

    let heatNo = 1;
    for(const [classA, classB] of pairs){
      const listA = cm.get(classA) || [];
      const listB = classB ? (cm.get(classB) || []) : [];
      const need = Math.max(Math.ceil(listA.length/2), Math.ceil(listB.length/2), 1);

      for(let k=0;k<need;k++){
        const pickedA = listA.slice(k*2, k*2+2).map(x=>x.id);
        const pickedB = listB.slice(k*2, k*2+2).map(x=>x.id);
        const lanes = laneAssign({ classA, classB: (classB||''), pickedA, pickedB, fillStrategy });
        const h = {
          grade,
          event,
          round,
          heatNo,
          classA,
          classB: (classB||''),
          lanes,
          locked: false,
          createdAt: now + (createdSeq++)
        };
        h.id = makeHeatId(h);
        heats.push(h);
        heatNo++;
      }
    }
  }

  const msg = `${heats.length} 組（${grades.length} 個年級）`;
  return {heats, msg};
}

function byId(arr){ return Object.fromEntries(arr.map(x=>[x.id,x])); }

function renderParticipantsSummary(){
  if(!state.participants.length){
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
  if(!state.heats.length){
    heatsOverview.innerHTML = '';
    return;
  }
  const heats = state.heats.slice().sort((a,b)=>a.createdAt-b.createdAt);
  const head = `
    <table class="table">
      <thead>
        <tr>
          <th>看板</th>
          <th>年級</th><th>項目</th><th>組次</th><th>A班</th><th>B班</th>
          <th>Lane1</th><th>Lane2</th><th>Lane3</th><th>Lane4</th>
        </tr>
      </thead>
      <tbody>
        ${heats.map(h=>{
          const isCurrent = state.ui.currentHeatId === h.id;
          const laneCell = (L)=>{
            const p = L.pid ? pMap[L.pid] : null;
            const n = p ? p.name : '（空）';
            const c = p ? p.class : (L.cls||'');
            return `${escapeHtml(c)} ${escapeHtml(n)}`.trim();
          };
          return `
            <tr>
              <td><button data-act="setCurrent" data-id="${h.id}">${isCurrent?'✅':'設為'}</button></td>
              <td>${h.grade}</td>
              <td>${escapeHtml(h.event)}</td>
<td>${h.heatNo}</td>
              <td>${escapeHtml(h.classA)}</td>
              <td>${escapeHtml(h.classB)}</td>
              <td>${laneCell(h.lanes[0])}</td>
              <td>${laneCell(h.lanes[1])}</td>
              <td>${laneCell(h.lanes[2])}</td>
              <td>${laneCell(h.lanes[3])}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="muted">提示：此表為「全部分組一次顯示」。看板目前組次只在此處切換：點第一欄「設為/✅」。</div>
  `;
  heatsOverview.innerHTML = head;
  heatsOverview.querySelectorAll('button[data-act="setCurrent"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.ui.currentHeatId = btn.dataset.id;
      saveState(state);
      renderHeats();
    });
  });
}

function renderHeats(){
  if(!state.heats.length){
    heatsList.innerHTML = '<div class="muted">尚未建立任何組次。</div>';
    return;
  }
  const pMap = byId(state.participants);
  renderHeatsOverview(pMap);
  const rows = state.heats
    .slice()
    .sort((a,b)=>a.createdAt-b.createdAt)
    .map(h=>{
      const isCurrent = state.ui.currentHeatId === h.id;
      const lanesHtml = `
        <div class="lanes">
          ${h.lanes.map(L=>{
            const p = L.pid ? pMap[L.pid] : null;
            const name = p ? p.name : '（空）';
            const cls = p ? p.class : (L.cls || '');
            return `
              <div class="lane">
                <div class="n">Lane ${L.lane}</div>
                <div class="p">${escapeHtml(name)}</div>
                <div class="c">${escapeHtml(cls)}</div>
              </div>`;
          }).join('')}
        </div>`;
      return `
        <div class="card" style="margin-top:10px">
          <div class="row" style="justify-content:space-between">
            <div>
              <span class="badge">${h.grade}年級</span>
              <span class="badge">${escapeHtml(h.event)}</span>
              <span class="badge">${escapeHtml(h.round)}</span>
              <span class="badge">第 ${h.heatNo} 組</span>
              ${h.locked ? '<span class="badge">已鎖定</span>' : ''}
              ${isCurrent ? '<span class="badge">看板顯示中</span>' : '<span class="muted">（切換看板請用上方總覽第一欄）</span>'}
            </div>
            <div class="row">
              
              <button data-act="toggleLock" data-id="${h.id}">${h.locked?'解鎖':'鎖定'}</button>
              <button data-act="reseed" data-id="${h.id}" ${h.locked?'disabled':''}>重排</button>
              <button data-act="del" data-id="${h.id}" class="danger">刪除</button>
            </div>
          </div>
          <div class="muted">A: ${escapeHtml(h.classA)}　B: ${escapeHtml(h.classB)}</div>
          ${lanesHtml}
        </div>`;
    }).join('');
  heatsList.innerHTML = rows;

  heatsList.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const idx = state.heats.findIndex(x=>x.id===id);
      if(idx < 0) return;

      if(act === 'setCurrent'){
        state.ui.currentHeatId = id;
        saveState(state);
        renderHeats();
        return;
      }
      if(act === 'toggleLock'){
        state.heats[idx].locked = !state.heats[idx].locked;
        saveState(state);
        renderHeats();
        return;
      }
      if(act === 'reseed'){
        const h = state.heats[idx];
        if(h.locked) return;
        // recompute based on stored picks
        h.lanes = laneAssign({
          classA: h.classA, classB: h.classB,
          pickedA: h.pickedA, pickedB: h.pickedB,
          fillStrategy: h.fillStrategy
        });
        saveState(state);
        renderHeats();
        return;
      }
      if(act === 'del'){
        state.heats.splice(idx,1);
        if(state.ui.currentHeatId === id) state.ui.currentHeatId = null;
        saveState(state);
        renderHeats();
      }
    });
  });
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

// === Import ===
async function importCsvText(text){
  const {records} = parseCsv(text);
  if(!records.length){
    setMsg(importMsg, '匯入失敗：沒有讀到資料列。');
    return;
  }
  // Basic validation: only accept known classes 1A/1B/2A/2B? We'll allow any, but grade filter applies.
  state.participants = records;
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

document.getElementById('btnLoadSample')?.addEventListener('click', async ()=>{
  const res = await fetch('./data/participants.sample.csv', {cache:'no-store'});
  const text = await res.text();
  importCsvText(text);
});

document.getElementById('btnReset')?.addEventListener('click', ()=>{
  if(confirm('確定要清空此瀏覽器資料？')){
    resetState();
    state = loadState();
    renderAll();
  }
});

// === Create heat ===



function renderAll(){
  renderParticipantsSummary();
  renderHeats();
}

// === init ===
(async ()=>{
  // 若未載入任何名單，預設自動載入既定名單（data/participants.sample.csv）
  if(!state.participants?.length){
    try{
      const res = await fetch('./data/participants.sample.csv', {cache:'no-store'});
      if(res.ok){
        const csvText = await res.text();
        importCsvText(csvText);
        setMsg(importMsg, '已自動載入既定名單（範例名單）。');
      }
    }catch(e){
      // ignore: 仍可手動匯入
    }
  }

  renderAll();

  // === Remote cross-device sync (optional) ===  onSave((st)=>RemoteSync.push(st));
})();