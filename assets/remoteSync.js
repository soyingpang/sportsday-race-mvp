import { loadState, saveState } from './store.js';

export const RemoteSync = {
  cfg: null,
  timer: null,
  pulling: false,
  async init(){
    try{
      const res = await fetch('./data/remote-sync.json', {cache:'no-store'});
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
  async push(state){
    if(!this.cfg?.enabled) return;
    try{
      await fetch(this.cfg.endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          room: this.cfg.room,
          token: this.cfg.token,
          state
        })
      });
    }catch(e){
      console.warn('[RemoteSync] push failed', e);
    }
  },
  async pull(){
    if(!this.cfg?.enabled || this.pulling) return;
    this.pulling = true;
    try{
      const url = new URL(this.cfg.endpoint);
      url.searchParams.set('room', this.cfg.room);
      url.searchParams.set('token', this.cfg.token);
      const res = await fetch(url.toString(), {cache:'no-store'});
      if(!res.ok) return;
      const remote = await res.json();
      const remoteState = remote?.state;
      if(!remoteState?.version) return;

      const local = loadState();
      const rAt = Number(remoteState.updatedAt || 0);
      const lAt = Number(local.updatedAt || 0);

      if(rAt > lAt){
        saveState(remoteState, {broadcast:true, runHooks:false});
      }
    }catch(e){
      console.warn('[RemoteSync] pull failed', e);
    }finally{
      this.pulling = false;
    }
  }
};
