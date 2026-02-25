const KEY = 'sportsday_race_v2';
export const STORAGE_KEY = KEY;
const CH = 'sportsday_race_bc_v2';

// Optional hooks (e.g., analytics) that should run after each save.
const saveHooks = [];
export function onSave(cb){ if(typeof cb==='function') saveHooks.push(cb); }

export function defaultState(){
  return {
    version: 2,
    participants: [],
    heats: [],
    // results[heatId][lane] = { pid, timeSec, status, note, updatedAt }
    results: {},
    ui: { currentHeatId: null },
    updatedAt: Date.now()
  };
}

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw){
      // Try migrate from v1 if exists
      const v1 = localStorage.getItem('sportsday_race_v1');
      if(v1){
        const st1 = JSON.parse(v1);
        const st2 = defaultState();
        st2.participants = st1.participants || [];
        st2.heats = st1.heats || [];
        st2.results = st1.results || {};
        st2.ui = st1.ui || { currentHeatId: null };
        st2.updatedAt = Date.now();
        localStorage.setItem(KEY, JSON.stringify(st2));
        return st2;
      }
      return defaultState();
    }
    const st = JSON.parse(raw);
    if(!st || st.version !== 2) return defaultState();
    st.participants = st.participants || [];
    st.heats = st.heats || [];
    st.results = st.results || {};
    st.ui = st.ui || { currentHeatId: null };
    return st;
  }catch(e){
    console.warn('loadState fail', e);
    return defaultState();
  }
}

export function saveState(state, {broadcast=true, runHooks=true} = {}){
  state.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  if(broadcast && bc) bc.postMessage({type:'STATE_UPDATED', updatedAt: state.updatedAt});
  if(runHooks){
    for(const fn of saveHooks){
      try{ fn(state); }catch(e){ console.warn('onSave hook fail', e); }
    }
  }
}

export function resetState(){
  localStorage.removeItem(KEY);
  saveState(defaultState());
}

export const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(CH) : null;

export function subscribeStateUpdates(onUpdate){
  // BroadcastChannel for same-origin tabs; storage event as fallback.
  if(bc) bc.onmessage = (ev)=>{
    if(ev?.data?.type === 'STATE_UPDATED') onUpdate?.(ev.data);
  };
  window.addEventListener('storage', (e)=>{
    if(e.key === KEY) onUpdate?.({type:'STATE_UPDATED', updatedAt: Date.now(), via:'storage'});
  });
}
