
import { loadState, subscribeStateUpdates } from './store.js';
import { computeTop10ByGrade } from './logic.js';

let state = loadState();
const el = (id)=>document.getElementById(id);

const clock = el('clock');
const upcoming = el('upcoming');
const upHint = el('upHint');

const lbG1 = el('lbG1');
const lbG2 = el('lbG2');
const g1Hint = el('g1Hint');
const g2Hint = el('g2Hint');

function tick(){
  const d = new Date();
  if(clock) clock.textContent = d.toLocaleString('zh-Hant-TW', { hour12:false });
}
setInterval(tick, 1000); tick();

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function heatOrder(){
  return (state.heats||[]).slice().sort((a,b)=>
    String(a.grade).localeCompare(String(b.grade)) ||
    String(a.event).localeCompare(String(b.event),'zh-Hant') ||
    String(a.round).localeCompare(String(b.round),'zh-Hant') ||
    (a.heatNo||0)-(b.heatNo||0) ||
    String(a.id).localeCompare(String(b.id))
  );
}

// 「黎緊三隊」：從目前 heat 後面開始，把 classA/classB 依序去重取 3 個。
function computeUpcomingTeams(){
  const heats = heatOrder();
  if(!heats.length) return {teams:[], reason:'尚未建立賽程'};
  const curId = state.ui?.currentHeatId;
  const idx = curId ? heats.findIndex(h=>h.id===curId) : -1;

  const seen = new Set();
  const teams = [];

  const pushTeam = (t)=>{
    const s = String(t||'').trim();
    if(!s) return;
    if(seen.has(s)) return;
    seen.add(s);
    teams.push(s);
  };

  // start from next heat; if none, start from first
  const start = (idx>=0) ? idx+1 : 0;
  for(let i=start;i<heats.length && teams.length<3;i++){
    pushTeam(heats[i].classA);
    if(teams.length>=3) break;
    pushTeam(heats[i].classB);
  }
  // if still not enough, wrap from beginning
  for(let i=0;i<start && teams.length<3;i++){
    pushTeam(heats[i].classA);
    if(teams.length>=3) break;
    pushTeam(heats[i].classB);
  }

  return {teams, reason: teams.length? '' : '賽程不足以推算 3 隊'};
}

function renderUpcoming(){
  const {teams, reason} = computeUpcomingTeams();
  if(!teams.length){
    upcoming.innerHTML = `<div class="muted">（${escapeHtml(reason || '無資料')}）</div>`;
    upHint.textContent = '提示：可在後台「組次清單」選一場按「設為目前場次」，看板就會往後推算。';
    return;
  }
  upHint.textContent = '';
  upcoming.innerHTML = `
    <div class="lbRow lbHead">
      <div>#</div><div>隊伍</div><div></div><div></div>
    </div>
    ${teams.map((t,i)=>`
      <div class="lbRow">
        <div class="rk">${i+1}</div>
        <div class="nm">${escapeHtml(t)}</div>
        <div class="cl"></div>
        <div class="tm"></div>
      </div>
    `).join('')}
  `;
}

function renderGradeTop10(grade, root, hintEl){
  const list = computeTop10ByGrade(state, grade);
  if(!list.length){
    root.innerHTML = '<div class="muted">尚未匯入名單。</div>';
    hintEl.textContent = '';
    return;
  }
  const hasAnyComplete = list.some(x=>x.complete);
  hintEl.textContent = hasAnyComplete ? '' : '尚未輸入三個遊戲時間；後台輸入後，這裡會出現排名。';

  root.innerHTML = `
    <div class="lbRow lbHead">
      <div>#</div><div>姓名</div><div>班別</div><div>總時間</div>
    </div>
    ${list.map(r=>{
      const medal = r.rank===1?'🥇':(r.rank===2?'🥈':(r.rank===3?'🥉':''));
      const t = r.complete ? r.total.toFixed(2) : '—';
      const rk = r.rank ? `${medal} ${r.rank}` : '—';
      return `
        <div class="lbRow">
          <div class="rk">${rk}</div>
          <div class="nm">${escapeHtml(r.name)}</div>
          <div class="cl">${escapeHtml(r.class)}</div>
          <div class="tm">${escapeHtml(String(t))}</div>
        </div>
      `;
    }).join('')}
  `;
}

function render(){
  renderUpcoming();
  renderGradeTop10('1', lbG1, g1Hint);
  renderGradeTop10('2', lbG2, g2Hint);
}

subscribeStateUpdates(()=>{ state = loadState(); render(); });
render();
