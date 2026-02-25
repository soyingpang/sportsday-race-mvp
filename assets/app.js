import { loadState, saveState, resetState, subscribeStateUpdates, onSave } from './store.js';
import { RemoteSync } from './remoteSync.js';
import { parseCsv, gradeOfClass, laneAssign, makeHeatId } from './logic.js';
import { exportTotalScoreSheet, exportBackupJSON, exportHandScoreSheet } from './export.js';
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
const selGrade = el('selGrade');
const selClassA = el('selClassA');
const selClassB = el('selClassB');
const inpEvent = el('inpEvent');
const inpHeatNo = el('inpHeatNo');
const pickA = el('pickA');
const pickB = el('pickB');
const selFill = el('selFill');
const btnBuildHeats = el('btnBuildHeats');
const buildMode = ()=> (document.querySelector('input[name="buildMode"]:checked')?.value || 'single');
const createMsg = el('createMsg');
const heatsList = el('heatsList');
const cat1 = el('cat1');
const cat2 = el('cat2');
const cat3 = el('cat3');
const heatsOverview = el('heatsOverview');
const btnExportBackup = el('btnExportBackup');
const btnExportTotal = el('btnExportTotal');
const btnExportHand = el('btnExportHand');

function setMsg(node, text){ node.textContent = text || ''; }

function syncCategoriesToUI(){
  const cats = state.categories || {c1:'類別1',c2:'類別2',c3:'類別3'};
  if(cat1) cat1.value = cats.c1 || '類別1';
  if(cat2) cat2.value = cats.c2 || '類別2';
  if(cat3) cat3.value = cats.c3 || '類別3';
}

function saveCategoriesFromUI(){
  if(!cat1 || !cat2 || !cat3) return;
  state.categories = { c1: (cat1.value||'類別1').trim(), c2: (cat2.value||'類別2').trim(), c3: (cat3.value||'類別3').trim() };
  saveState(state);
}

cat1?.addEventListener('change', saveCategoriesFromUI);
cat2?.addEventListener('change', saveCategoriesFromUI);
cat3?.addEventListener('change', saveCategoriesFromUI);


btnExportBackup?.addEventListener('click', ()=>{
  exportBackupJSON(state);
});

btnExportTotal?.addEventListener('click', ()=>{
  if(!state.participants?.length) return;
  saveCategoriesFromUI();
  exportTotalScoreSheet(state);
});

btnExportHand?.addEventListener('click', ()=>{
  if(!state.heats?.length) return;
  exportHandScoreSheet(state);
});

function byId(arr){ return Object.fromEntries(arr.map(x=>[x.id,x])); }

function classesOfGrade(grade){
  const set = new Set(state.participants
    .filter(p=>gradeOfClass(p.class)===String(grade) && p.present)
    .map(p=>p.class));
  return Array.from(set).sort();
}

function renderClassOptions(){
  const grade = selGrade.value;
  const classes = classesOfGrade(grade);
  selClassA.innerHTML = classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  selClassB.innerHTML = classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(selClassB.value === selClassA.value && classes.length>1){
    selClassB.value = classes[1];
  }
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

  const listA = state.participants.filter(p=>p.class===classA && p.present).sort((a,b)=>a.no-b.no);
  const listB = state.participants.filter(p=>p.class===classB && p.present).sort((a,b)=>a.no-b.no);

  const mk = (p, grp)=>`
    <label>
      <input type="checkbox" data-grp="${grp}" value="${p.id}" />
      <span>${p.no}. ${p.name}</span>
    </label>`;
  pickA.innerHTML = (listA.length ? (renderBulkControls('A') + listA.map(p=>mk(p,'A')).join('')) : '<div class="muted">（無資料）</div>');
  pickB.innerHTML = (listB.length ? (renderBulkControls('B') + listB.map(p=>mk(p,'B')).join('')) : '<div class="muted">（無資料）</div>');
  // 批次選取 + 勾選數提示（允許超過 2；建立組次時只取前 2 位）
  function updateCount(root, grp){
    const checked = root.querySelectorAll('input[type=checkbox]:checked').length;
    const node = root.querySelector(`[data-count="${grp}"]`);
    if(node){
      node.textContent = `已選 ${checked} 位（建立組次只取前2位）`;
    }
  }

  [pickA, pickB].forEach(root=>{
    // bulk buttons
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

    // checkbox count
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
btnBuildHeats?.addEventListener('click', ()=>{
  const mode = buildMode();
  createHeats({all: mode==='all'});
});

function createHeats({all}){
  const grade = selGrade.value;
  const classA = selClassA.value;
  const classB = selClassB.value;

  if(!state.participants.length){
    setMsg(createMsg, '請先匯入名單。');
    return;
  }
  if(!classA || !classB){
    setMsg(createMsg, '請選擇兩個班級。');
    return;
  }
  if(classA === classB){
    setMsg(createMsg, 'A 班與 B 班不可相同。');
    return;
  }
  // enforce grade separation
  if(gradeOfClass(classA) !== String(grade) || gradeOfClass(classB) !== String(grade)){
    setMsg(createMsg, '年級不符合：1年級與2年級不可混賽。');
    return;
  }

  const pickedAAllRaw = Array.from(pickA.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
  const pickedBAllRaw = Array.from(pickB.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);

  if(pickedAAllRaw.length + pickedBAllRaw.length === 0){
    setMsg(createMsg, '請先用「全選 / 取前2位」或自行勾選名單。');
    return;
  }

  // 依座號排序（確保「全選」後分組穩定）
  const pMap = byId(state.participants);
  const sortByNo = (ids)=> ids
    .filter(id=>pMap[id])
    .slice()
    .sort((a,b)=>{
      const pa=pMap[a], pb=pMap[b];
      return (pa.no - pb.no) || String(pa.name).localeCompare(String(pb.name), 'zh-Hant');
    });

  const pickedAAll = sortByNo(pickedAAllRaw);
  const pickedBAll = sortByNo(pickedBAllRaw);

  const event = (inpEvent.value || '60m').trim();
  const round = "";
  const startHeatNo = Number(inpHeatNo.value || 1);

  const chunk2 = (arr)=>{
    const out=[];
    for(let i=0;i<arr.length;i+=2) out.push(arr.slice(i,i+2));
    return out.length ? out : [[]];
  };

  const chunksA = chunk2(pickedAAll);
  const chunksB = chunk2(pickedBAll);

  const total = all ? Math.max(chunksA.length, chunksB.length) : 1;

  for(let i=0;i<total;i++){
    const pickedA = (chunksA[i] || []).slice(0,2);
    const pickedB = (chunksB[i] || []).slice(0,2);
    const heatNo = startHeatNo + i;

    const id = makeHeatId({grade, event, round, heatNo, classA, classB});
    const lanes = laneAssign({classA, classB, pickedA, pickedB, fillStrategy: selFill.value});

    state.heats.push({
      id, grade: String(grade), event, round, heatNo,
      classA, classB,
      pickedA, pickedB,
      fillStrategy: selFill.value,
      lanes,
      locked: false,
      createdAt: Date.now()
    });

    if(!state.ui.currentHeatId) state.ui.currentHeatId = id;
  }

  saveState(state);

  if(all){
    setMsg(createMsg, `已自動建立 ${total} 組：${grade}年級 ${event} ${round}（由已勾選名單分批每組每班 2 位）`);
  }else{
    setMsg(createMsg, `已建立：${grade}年級 ${event} ${round} 第${startHeatNo}組`);
  }
  renderHeats();
}


// === Sync ===

selGrade?.addEventListener('change', renderClassOptions);
selClassA?.addEventListener('change', renderPickers);
selClassB?.addEventListener('change', renderPickers);

function renderAll(){
  renderParticipantsSummary();
  renderClassOptions();
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

  // === Remote cross-device sync (optional) ===
  await RemoteSync.init();
  onSave((st)=>RemoteSync.push(st));
})();