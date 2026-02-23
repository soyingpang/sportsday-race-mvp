import { loadState, saveState, resetState, bc } from './store.js';
import { parseCsv, gradeOfClass, laneAssign, makeHeatId } from './logic.js';

let state = loadState();

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
const createMsg = el('createMsg');
const heatsList = el('heatsList');

function setMsg(node, text){ node.textContent = text || ''; }

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
  pickA.innerHTML = listA.map(p=>mk(p,'A')).join('') || '<div class="muted">（無資料）</div>';
  pickB.innerHTML = listB.map(p=>mk(p,'B')).join('') || '<div class="muted">（無資料）</div>';

  // limit to 2 selections per group
  for(const root of [pickA, pickB]){
    root.addEventListener('change', (e)=>{
      const grp = e.target?.dataset?.grp;
      if(!grp) return;
      const checked = root.querySelectorAll('input[type=checkbox]:checked');
      if(checked.length > 2){
        e.target.checked = false;
        setMsg(createMsg, '每班最多選 2 位。');
      }else{
        setMsg(createMsg, '');
      }
    }, {once:true});
  }
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

function renderHeats(){
  if(!state.heats.length){
    heatsList.innerHTML = '<div class="muted">尚未建立任何組次。</div>';
    return;
  }
  const pMap = byId(state.participants);
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
              ${isCurrent ? '<span class="badge">看板顯示中</span>' : ''}
            </div>
            <div class="row">
              <button data-act="setCurrent" data-id="${h.id}">設為目前組次</button>
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
        return;
      }
      if(act === 'toggleLock'){
        state.heats[idx].locked = !state.heats[idx].locked;
        saveState(state);
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
        return;
      }
      if(act === 'del'){
        state.heats.splice(idx,1);
        if(state.ui.currentHeatId === id) state.ui.currentHeatId = null;
        saveState(state);
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
document.getElementById('btnCreateHeat')?.addEventListener('click', ()=>{
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

  const pickedA = Array.from(pickA.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
  const pickedB = Array.from(pickB.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value);
  if(pickedA.length>2 || pickedB.length>2){
    setMsg(createMsg, '每班最多選 2 位。');
    return;
  }
  if(pickedA.length + pickedB.length === 0){
    setMsg(createMsg, '至少要選 1 位參賽者。');
    return;
  }

  const event = (inpEvent.value || '60m').trim();
  const round = selRound.value;
  const heatNo = Number(inpHeatNo.value || 1);

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
  saveState(state);
  setMsg(createMsg, `已建立：${grade}年級 ${event} ${round} 第${heatNo}組`);
  renderHeats();
});

// === Sync ===
bc.onmessage = (ev)=>{
  if(ev?.data?.type === 'STATE_UPDATED'){
    state = loadState();
    renderAll();
  }
};

selGrade.addEventListener('change', renderClassOptions);
selClassA.addEventListener('change', renderPickers);
selClassB.addEventListener('change', renderPickers);

function renderAll(){
  renderParticipantsSummary();
  renderClassOptions();
  renderHeats();
}

renderAll();
