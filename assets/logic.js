// === Core helpers ===
export function gradeOfClass(cls){
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
  // Expected header: id,class,no,name,present
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
        if(row.length && row[row.length-1].endsWith('\r')) row[row.length-1] = row[row.length-1].slice(0,-1);
        if(row.some(x=>x!=='')) rows.push(row);
        row=[]; i++; continue;
      }
      field += ch; i++; continue;
    }
  }
  if(field.length || row.length){
    row.push(field);
    if(row.some(x=>x!=='')) rows.push(row);
  }
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

export function normalizeTimeInput(v){
  if(v === null || v === undefined) return null;
  const s = String(v).trim();
  if(!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// === 4-lane assignment (A2+B2) kept for schedule calling ===
export function laneAssign({classA, classB, pickedA, pickedB, fillStrategy}){
  const A = (pickedA||[]).slice(0,2);
  const B = (pickedB||[]).slice(0,2);

  const slots = [
    {cls: classA, pid: A[0] ?? null},
    {cls: classA, pid: A[1] ?? null},
    {cls: classB, pid: B[0] ?? null},
    {cls: classB, pid: B[1] ?? null},
  ];

  if(fillStrategy === 'other'){
    const present = slots.filter(s=>s.pid);
    const filled = present.concat(Array(4-present.length).fill({cls:'', pid:null}));
    return filled.map((x,i)=>({lane:i+1, ...x}));
  }
  return slots.map((x,i)=>({lane:i+1, ...x}));
}

// Stable heat id (deterministic; no Date.now)
export function makeHeatId({grade, event, round, heatNo, classA, classB}){
  const norm = (s)=>String(s||'').trim().replace(/\s+/g,'_');
  return `${norm(grade)}-${norm(event)}-${norm(round)}-H${String(heatNo)}-${norm(classA)}_vs_${norm(classB)}`;
}

// === Ranking: sum of 3 game times ===
export function computeTop10ByGrade(state, grade){
  const people = (state.participants||[])
    .filter(p=>p.present && gradeOfClass(p.class)===String(grade))
    .slice()
    .sort((a,b)=> String(a.class).localeCompare(String(b.class),'zh-Hant') || (a.no||0)-(b.no||0));

  const times = state.games?.times || {};
  const rows = people.map(p=>{
    const rec = times[p.id] || {};
    const t1 = (typeof rec.t1 === 'number') ? rec.t1 : null;
    const t2 = (typeof rec.t2 === 'number') ? rec.t2 : null;
    const t3 = (typeof rec.t3 === 'number') ? rec.t3 : null;
    const complete = (t1!==null && t2!==null && t3!==null);
    const total = complete ? (t1+t2+t3) : null;
    return { pid:p.id, name:p.name, class:p.class, no:p.no, t1, t2, t3, total, complete };
  });

  rows.sort((a,b)=>{
    // complete first
    if(a.complete !== b.complete) return a.complete ? -1 : 1;
    // then by total
    if(a.total === null && b.total !== null) return 1;
    if(a.total !== null && b.total === null) return -1;
    if(a.total !== null && b.total !== null && a.total !== b.total) return a.total - b.total;
    // tie-break: class, no
    return String(a.class).localeCompare(String(b.class),'zh-Hant') || (a.no||0)-(b.no||0);
  });

  // assign rank for complete only; incomplete rank null
  let rank=0;
  for(const r of rows){
    if(!r.complete) { r.rank = null; continue; }
    rank += 1;
    r.rank = rank;
  }
  return rows.slice(0,10);
}

export function computeAllTotals(state){
  // For export: return per grade rows with ranks.
  const out = [];
  for(const g of ['1','2']){
    const people = (state.participants||[]).filter(p=>p.present && gradeOfClass(p.class)===g);
    const times = state.games?.times || {};
    const rows = people.map(p=>{
      const rec = times[p.id] || {};
      const t1 = (typeof rec.t1 === 'number') ? rec.t1 : null;
      const t2 = (typeof rec.t2 === 'number') ? rec.t2 : null;
      const t3 = (typeof rec.t3 === 'number') ? rec.t3 : null;
      const complete = (t1!==null && t2!==null && t3!==null);
      const total = complete ? (t1+t2+t3) : null;
      return { grade:g, class:p.class, no:p.no, name:p.name, pid:p.id, t1,t2,t3,total,complete, note: rec.note||'' };
    });

    rows.sort((a,b)=>{
      if(a.complete !== b.complete) return a.complete ? -1 : 1;
      if(a.total === null && b.total !== null) return 1;
      if(a.total !== null && b.total === null) return -1;
      if(a.total !== null && b.total !== null && a.total !== b.total) return a.total - b.total;
      return String(a.class).localeCompare(String(b.class),'zh-Hant') || (a.no||0)-(b.no||0);
    });

    let rk=0;
    for(const r of rows){
      if(!r.complete){ r.rank=''; continue; }
      rk += 1;
      r.rank = rk;
    }
    out.push(...rows);
  }
  return out;
}
