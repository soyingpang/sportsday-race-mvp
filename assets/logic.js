// === Domain logic (4 lanes, A2+B2) ===
export function gradeOfClass(cls){
  // '1A' -> '1', '2B' -> '2'
  const m = String(cls || '').trim().match(/^(\d+)/);
  return m ? m[1] : '';
}

export function normalizeBool(v){
  if(typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return (s === '1' || s === 'true' || s === 'y' || s === 'yes');
}

export function parseCsv(text){
  // Simple CSV parser (supports commas, quotes).
  // Expected header includes: id,class,no,name,present
  const rows = [];
  let i=0, field='', row=[], inQ=false;
  while(i < text.length){
    const ch = text[i];
    if(inQ){
      if(ch === '"' && text[i+1] === '"'){ field += '"'; i+=2; continue; }
      if(ch === '"'){ inQ=false; i++; continue; }
      field += ch; i++; continue;
    }else{
      if(ch === '"'){ inQ=true; i++; continue; }
      if(ch === ','){ row.push(field); field=''; i++; continue; }
      if(ch === '\n'){
        row.push(field); field='';
        // trim CR
        if(row.length && row[row.length-1].endsWith('\r')){
          row[row.length-1] = row[row.length-1].slice(0,-1);
        }
        if(row.some(x=>x!=='')) rows.push(row);
        row=[]; i++; continue;
      }
      field += ch; i++; continue;
    }
  }
  if(field.length || row.length){ row.push(field); if(row.some(x=>x!=='')) rows.push(row); }

  if(rows.length < 2) return {header:[], records:[]};
  const header = rows[0].map(h=>h.trim());
  const idx = Object.fromEntries(header.map((h,ix)=>[h,ix]));
  const get = (r,k)=> r[idx[k]] ?? '';
  const records = rows.slice(1).map(r=>({
    id: String(get(r,'id')).trim(),
    class: String(get(r,'class')).trim(),
    no: Number(get(r,'no') || 0),
    name: String(get(r,'name')).trim(),
    present: normalizeBool(get(r,'present'))
  })).filter(x=>x.id && x.class && x.name);
  return {header, records};
}

export function laneAssign({classA, classB, pickedA, pickedB, fillStrategy}){
  // Order: A1, A2, B1, B2; 4 lanes
  const lanes = [null,null,null,null];
  const A = pickedA.slice(0,2);
  const B = pickedB.slice(0,2);

  const slots = [
    {cls: classA, pid: A[0] ?? null},
    {cls: classA, pid: A[1] ?? null},
    {cls: classB, pid: B[0] ?? null},
    {cls: classB, pid: B[1] ?? null},
  ];

  if(fillStrategy === 'other'){
    // Move non-null forward to fill empty slots but keep relative order of existing.
    const present = slots.filter(s=>s.pid);
    const filled = present.concat(Array(4-present.length).fill({cls:'', pid:null}));
    for(let i=0;i<4;i++) lanes[i] = {lane:i+1, ...filled[i]};
  }else{
    for(let i=0;i<4;i++) lanes[i] = {lane:i+1, ...slots[i]};
  }
  return lanes;
}

export function makeHeatId({grade, event, round, heatNo, classA, classB}){
  // Deterministic id (stable across devices / export).
  // Example: 1-60m-預賽-H01-1A_vs_1B
  const h = String(heatNo).padStart(2,'0');
  return `${grade}-${event}-${round}-H${h}-${classA}_vs_${classB}`;
}


// === Ranking ===
export function normalizeTimeInput(v){
  if(v === null || v === undefined) return null;
  const s = String(v).trim();
  if(!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function statusRank(status){
  // smaller is better; OK first, then DNS/DNF/DQ at bottom
  const s = String(status || 'OK').toUpperCase();
  if(s === 'OK') return 0;
  if(s === 'DNS') return 1;
  if(s === 'DNF') return 2;
  if(s === 'DQ')  return 3;
  return 9;
}

export function computeLeaderboard(state, {grade, event, round}){
  const heats = (state.heats||[]).filter(h =>
    String(h.grade)===String(grade) &&
    String(h.event)===String(event) &&
    String(h.round)===String(round)
  );

  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const rows = [];
  for(const h of heats){
    const rHeat = (state.results||{})[h.id] || {};
    for(const L of (h.lanes||[])){
      const pid = L.pid;
      if(!pid) continue;
      const rec = rHeat[String(L.lane)] || { pid, status:'OK', timeSec:null, note:'' };
      const p = pMap[pid];
      if(!p) continue;
      rows.push({
        pid,
        name: p.name,
        class: p.class,
        no: p.no,
        heatId: h.id,
        heatNo: h.heatNo,
        lane: L.lane,
        status: String(rec.status||'OK').toUpperCase(),
        timeSec: (rec.timeSec===0 || rec.timeSec) ? rec.timeSec : null,
        note: rec.note || ''
      });
    }
  }

  rows.sort((a,b)=>{
    const sa = statusRank(a.status);
    const sb = statusRank(b.status);
    if(sa !== sb) return sa - sb;
    // OK sort by time; null times go after numeric times
    const ta = (a.timeSec===0 || a.timeSec) ? a.timeSec : Infinity;
    const tb = (b.timeSec===0 || b.timeSec) ? b.timeSec : Infinity;
    if(ta !== tb) return ta - tb;
    // stable tie-breaker: class, no
    const cc = String(a.class).localeCompare(String(b.class), 'zh-Hant');
    if(cc!==0) return cc;
    return (a.no||0)-(b.no||0);
  });

  // assign ranks for OK only; others show '-' rank
  let rank = 0;
  for(const row of rows){
    if(row.status === 'OK' && (row.timeSec===0 || row.timeSec)){
      rank += 1;
      row.rank = rank;
    }else{
      row.rank = null;
    }
  }
  return rows;
}
