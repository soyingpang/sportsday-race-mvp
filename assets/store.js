const KEY = 'sportsday_local_v1';
export const STORAGE_KEY = KEY;

export function defaultState(){
  return {
    version: 1,
    participants: [],   // [{id,class,no,name,present}]
    heats: [],          // schedule blocks (optional for calling next teams)
    ui: { currentHeatId: null },

    // 3-game time input (backend enter later)
    games: {
      labels: ['遊戲1','遊戲2','遊戲3'],
      // times[pid] = { t1:number|null, t2:number|null, t3:number|null, note:string }
      times: {}
    },

    updatedAt: Date.now()
  };
}

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    const st = JSON.parse(raw);
    if(!st || st.version !== 1) return defaultState();
    st.participants = st.participants || [];
    st.heats = st.heats || [];
    st.ui = st.ui || { currentHeatId: null };
    st.games = st.games || { labels:['遊戲1','遊戲2','遊戲3'], times:{} };
    st.games.labels = st.games.labels || ['遊戲1','遊戲2','遊戲3'];
    st.games.times = st.games.times || {};
    return st;
  }catch(e){
    console.warn('loadState fail', e);
    return defaultState();
  }
}

export function saveState(state){
  state.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  // let other tabs update via storage event (no BroadcastChannel, no remote sync)
}

export function resetState(){
  localStorage.removeItem(KEY);
  saveState(defaultState());
}

export function subscribeStateUpdates(onUpdate){
  window.addEventListener('storage', (e)=>{
    if(e.key === KEY) onUpdate?.({type:'STATE_UPDATED', updatedAt: Date.now()});
  });
}
