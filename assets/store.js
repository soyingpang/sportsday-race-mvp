const KEY = 'sportsday_race_v1';
const CH = 'sportsday_race_bc';

export function defaultState(){
  return {
    version: 1,
    participants: [],
    heats: [],
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
