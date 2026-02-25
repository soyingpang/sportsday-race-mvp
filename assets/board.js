import { loadState, subscribeStateUpdates, onSave } from './store.js';
import { computeLeaderboard, parseCsv } from './logic.js';
import { RemoteSync } from './remoteSync.js';

let state = loadState();
const el = (id)=>document.getElementById(id);

const clock = el('clock');
const lbTitle = el('lbTitle');
const leaderboard = el('leaderboard');
const lbHint = el('lbHint');

function tick(){
  const d = new Date();
  clock.textContent = d.toLocaleString('zh-Hant-TW', { hour12:false });
}
setInterval(tick, 1000); tick();

// 若未載入任何名單，預設自動載入既定名單（data/participants.sample.csv）
if(!state.participants?.length){
  try{
    const res = await fetch('./data/participants.sample.csv', {cache:'no-store'});
    if(res.ok){
      const csvText = await res.text();
      state.participants = parseCsv(csvText);
      // board 端不主動寫回 Remote，僅寫入本機以便顯示
      localStorage.setItem('sportsday_state_v1', JSON.stringify(state));
    }
  }catch(e){ /* ignore */ }
}

// === remote sync (cross-device) ===
await RemoteSync.init();
onSave((st)=>RemoteSync.push(st));


function getContext(){
  const heats = (state.heats || []).slice().sort((a,b)=>a.createdAt-b.createdAt);
  const curId = state.ui?.currentHeatId;
  const cur = heats.find(h=>h.id===curId) || heats[0] || null;
  if(!cur) return null;
  return { grade: cur.grade, event: cur.event };
}

function render(){
  const ctx = getContext();
  if(!ctx){
    lbTitle.textContent = '尚未建立場次';
    leaderboard.innerHTML = '<div class="muted">請先在管理端建立組次，並設為目前組次。</div>';
    lbHint.textContent = '';
    return;
  }

  const title = `🌟 ${ctx.grade}年級  ${ctx.event}    即時排行榜`;
  lbTitle.textContent = title;

  const list = computeLeaderboard(state, ctx).slice(0, 10);
  if(!list.length){
    leaderboard.innerHTML = '<div class="muted">尚未有成績。等小朋友跑完再入分～</div>';
    lbHint.textContent = '計分員 iPad 入分後，這裡會自動更新。';
    return;
  }
  lbHint.textContent = '';

  leaderboard.innerHTML = `
    <div class="lbRow lbHead">
      <div>#</div><div>姓名</div><div>班別</div><div>成績</div>
    </div>
    ${list.map(r=>{
      const medal = r.rank===1?'🥇':(r.rank===2?'🥈':(r.rank===3?'🥉':''));
      const time = r.status==='OK' ? (r.timeSec?.toFixed?.(2) ?? r.timeSec) : r.status;
      return `
        <div class="lbRow">
          <div class="rk">${medal} ${r.rank}</div>
          <div class="nm">${escapeHtml(r.name)}</div>
          <div class="cl">${escapeHtml(r.class)}</div>
          <div class="tm">${escapeHtml(String(time))}</div>
        </div>
      `;
    }).join('')}
  `;
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

subscribeStateUpdates(()=>{ state = loadState(); render(); });
render();

