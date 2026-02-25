import { loadState, saveState } from './store.js';

/**
 * RemoteSync (Google Apps Script Web App)
 * - Cross-device sync
 * - Merge results by heatId+lane with updatedAt (last-write-wins)
 * - Avoid CORS preflight by sending POST as text/plain (no custom headers)
 */
export const RemoteSync = {
  cfg: null,
  timer: null,
  pulling: false,
  pushing: false,

  async init(){
    try{
      const res = await fetch('./data/remote-sync.json', { cache:'no-store' });
      this.cfg = await res.json();
    }catch(e){
      console.warn('[RemoteSync] config missing -> disabled');
      return;
    }
    if(!this.cfg?.enabled) return;
    if(!this.cfg.endpoint || !this.cfg.room || !this.cfg.token){
      console.warn('[RemoteSync] config incomplete -> disabled');
      return;
    }
    const ms = Number(this.cfg.pollMs || 1000);
    if(this.timer) clearInterval(this.timer);
    this.timer = setInterval(()=>this.pull(), ms);
    await this.pull();
  },

  async getRemote(){
    const url = new URL(this.cfg.endpoint);
    url.searchParams.set('room', this.cfg.room);
    url.searchParams.set('token', this.cfg.token);
    const res = await fetch(url.toString(), { cache:'no-store' });
    if(!res.ok) return null;
    const remote = await res.json();
    return remote?.state || null;
  },

  mergeResults(remoteState, localState){
    // Merge results[heatId][lane] by updatedAt
    const out = remoteState.results || {};
    const local = localState.results || {};
    for(const heatId of Object.keys(local)){
      out[heatId] = out[heatId] || {};
      for(const lane of Object.keys(local[heatId]||{})){
        const a = out[heatId][lane];
        const b = local[heatId][lane];
        const aAt = Number(a?.updatedAt || 0);
        const bAt = Number(b?.updatedAt || 0);
        if(!a || bAt >= aAt){
          out[heatId][lane] = b;
        }
      }
    }
    remoteState.results = out;
  },

  mergeUi(remoteState, localState){
    remoteState.ui = remoteState.ui || { currentHeatId: null };
    const rAt = Number(remoteState.updatedAt || 0);
    const lAt = Number(localState.updatedAt || 0);

    // Prefer currentHeatId from the newer overall state (usually the laptop controller)
    if(lAt >= rAt && localState.ui?.currentHeatId){
      remoteState.ui.currentHeatId = localState.ui.currentHeatId;
    }
  },

  async push(localState){
    if(!this.cfg?.enabled || this.pushing) return;
    this.pushing = true;
    try{
      // Pull latest first to avoid overwriting others (critical for 4 iPads)
      const remoteState = await this.getRemote();
      const base = (remoteState && remoteState.version===1) ? remoteState : loadState();

      // Keep heats/participants as base (usually created on laptop)
      // Merge results from local into base
      this.mergeResults(base, localState);
      this.mergeUi(base, localState);

      // Bump updatedAt
      base.updatedAt = Date.now();

      // Send as text/plain to avoid CORS preflight
      await fetch(this.cfg.endpoint, {
        method: 'POST',
        body: JSON.stringify({
          room: this.cfg.room,
          token: this.cfg.token,
          state: base
        })
      });

    }catch(e){
      console.warn('[RemoteSync] push failed', e);
    }finally{
      this.pushing = false;
    }
  },

  async pull(){
    if(!this.cfg?.enabled || this.pulling) return;
    this.pulling = true;
    try{
      const remoteState = await this.getRemote();
      if(!remoteState?.version) return;

      const local = loadState();
      const rAt = Number(remoteState.updatedAt || 0);
      const lAt = Number(local.updatedAt || 0);

      if(rAt > lAt){
        saveState(remoteState, { broadcast:true, runHooks:false });
      }
    }catch(e){
      console.warn('[RemoteSync] pull failed', e);
    }finally{
      this.pulling = false;
    }
  }
};
