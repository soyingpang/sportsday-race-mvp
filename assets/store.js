const KEY = 'sportsday_race_v1';
export const STORAGE_KEY = KEY;
const CH = 'sportsday_race_bc';

const saveHooks = [];
export function onSave(cb){ if(typeof cb==='function') saveHooks.push(cb); }


export function defaultState(){
  return {
    version: 1,
    participants: [],
    heats: [],
    // results[heatId][lane] = { pid, timeSec, status, note, updatedAt }
    results: {},
    // For non-track 3-category score sheet (manual handwriting / optional later input)
    categories: { c1: '類別1', c2: '類別2', c3: '類別3' },
    categoryScores: {},
    ui: { currentHeatId: null },
    updatedAt: Date.now()
  };
}

export function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    const st = JSON.parse(raw);
    if(!st || st.version !== 1) return defaultState();
    // backfill new fields for older data
    st.results = st.results || {};
    st.categories = st.categories || { c1:'類別1', c2:'類別2', c3:'類別3' };
    st.categoryScores = st.categoryScores || {};
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
