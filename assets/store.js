const KEY = 'sportsday_race_v1';
const CH = 'sportsday_race_bc';

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

export function saveState(state, {broadcast=true} = {}){
  state.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  if(broadcast) bc.postMessage({type:'STATE_UPDATED', updatedAt: state.updatedAt});
}

export function resetState(){
  localStorage.removeItem(KEY);
  saveState(defaultState());
}

export const bc = new BroadcastChannel(CH);
