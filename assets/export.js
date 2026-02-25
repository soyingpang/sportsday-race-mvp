import { gradeOfClass } from './logic.js';

function escCsv(v){
  const s = String(v ?? '');
  if(/[",\n\r]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

function downloadText(filename, text, mime='text/csv'){
  const blob = new Blob([text], {type: mime+';charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

export function exportScheduleCsv(state){
  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const heats = (state.heats||[]).slice().sort((a,b)=>
    String(a.grade).localeCompare(String(b.grade)) ||
    String(a.event).localeCompare(String(b.event),'zh-Hant') ||
    String(a.round).localeCompare(String(b.round),'zh-Hant') ||
    (a.heatNo||0)-(b.heatNo||0) ||
    String(a.id).localeCompare(String(b.id))
  );

  const header = ['年級','項目','輪次','場次','A班','B班','Lane1','Lane2','Lane3','Lane4'];
  const rows = [header];

  const laneCell = (L)=>{
    const p = L?.pid ? pMap[L.pid] : null;
    const cls = p ? p.class : (L?.cls || '');
    const name = p ? p.name : '（空）';
    return `${cls} ${name}`.trim();
  };

  for(const h of heats){
    rows.push([
      h.grade, h.event, h.round, h.heatNo,
      h.classA, h.classB,
      laneCell(h.lanes?.[0]),
      laneCell(h.lanes?.[1]),
      laneCell(h.lanes?.[2]),
      laneCell(h.lanes?.[3]),
    ]);
  }

  const csv = rows.map(r=>r.map(escCsv).join(',')).join('\n');
  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  downloadText(`賽程表_${ts}.csv`, csv);
}

export function exportTotalTimesCsv(state){
  const labels = state.games?.labels || ['遊戲1','遊戲2','遊戲3'];
  const times = state.games?.times || {};
  const people = (state.participants||[]).filter(p=>p.present).slice().sort((a,b)=>
    gradeOfClass(a.class).localeCompare(gradeOfClass(b.class)) ||
    String(a.class).localeCompare(String(b.class),'zh-Hant') ||
    (a.no||0)-(b.no||0)
  );

  // Build per-grade ranking (complete only ranked)
  const byGrade = { '1': [], '2': [] };
  for(const p of people){
    const g = gradeOfClass(p.class);
    if(!byGrade[g]) continue;
    const rec = times[p.id] || {};
    const t1 = (typeof rec.t1 === 'number') ? rec.t1 : '';
    const t2 = (typeof rec.t2 === 'number') ? rec.t2 : '';
    const t3 = (typeof rec.t3 === 'number') ? rec.t3 : '';
    const complete = (t1!=='' && t2!=='' && t3!=='');
    const total = complete ? (Number(t1)+Number(t2)+Number(t3)) : '';
    byGrade[g].push({p, t1,t2,t3,total, complete, note: rec.note||''});
  }

  const rows = [[
    '年級','名次(同年級)','班別','座號','姓名',
    `${labels[0]}(秒)`,`${labels[1]}(秒)`,`${labels[2]}(秒)`,
    '總時間(秒)','備註'
  ]];

  for(const g of ['1','2']){
    const arr = byGrade[g] || [];
    arr.sort((a,b)=>{
      if(a.complete !== b.complete) return a.complete ? -1 : 1;
      if(a.total === '' && b.total !== '') return 1;
      if(a.total !== '' && b.total === '') return -1;
      if(a.total !== '' && b.total !== '' && a.total !== b.total) return a.total - b.total;
      return String(a.p.class).localeCompare(String(b.p.class),'zh-Hant') || (a.p.no||0)-(b.p.no||0);
    });
    let rk=0;
    for(const r of arr){
      const rank = r.complete ? (++rk) : '';
      rows.push([
        g, rank, r.p.class, r.p.no, r.p.name,
        r.t1, r.t2, r.t3, r.total, r.note
      ]);
    }
  }

  const csv = rows.map(r=>r.map(escCsv).join(',')).join('\n');
  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  downloadText(`計分總表_${ts}.csv`, csv);
}
