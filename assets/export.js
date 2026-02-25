// 匯出工具（零依賴）：CSV + JSON Backup
function downloadText(text, filename, mime='text/plain;charset=utf-8'){
  const blob = new Blob([text], {type:mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function escCSV(v){
  const s = (v==null) ? '' : String(v);
  if(/[",\n\r]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}

function rowsToCSV(rows){
  return rows.map(r=> (r||[]).map(escCSV).join(',')).join('\r\n');
}

export function exportBackupJSON(state){
  const ymd = new Date().toISOString().slice(0,10).replaceAll('-','');
  const text = JSON.stringify(state, null, 2);
  downloadText(text, `backup_${ymd}.json`, 'application/json;charset=utf-8');
}

// 1) 匯出：組次道次表（Lane1-4 名單）
export function exportLaneSheetCSV(state){
  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const rows = [[
    'heatId','grade','event','round','heatNo',
    'classA','classB',
    'lane1_pid','lane1_name','lane1_class','lane1_no',
    'lane2_pid','lane2_name','lane2_class','lane2_no',
    'lane3_pid','lane3_name','lane3_class','lane3_no',
    'lane4_pid','lane4_name','lane4_class','lane4_no'
  ]];
  for(const h of (state.heats||[])){
    const line = [h.id,h.grade,h.event,h.round,h.heatNo,h.classA,h.classB];
    for(let i=1;i<=4;i++){
      const slot = (h.lanes||[]).find(x=>Number(x.lane)===i) || {pid:null};
      const p = slot.pid ? pMap[slot.pid] : null;
      line.push(slot.pid||'', p?.name||'', p?.class||'', p?.no||'');
    }
    rows.push(line);
  }
  const ymd = new Date().toISOString().slice(0,10).replaceAll('-','');
  downloadText(rowsToCSV(rows), `lane_sheet_${ymd}.csv`, 'text/csv;charset=utf-8');
}

// 2) 匯出：成績表（每位選手一列）
export function exportResultsCSV(state){
  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const rows = [[
    'grade','event','round','heatNo','lane',
    'pid','name','class','no',
    'status','timeSec','note','updatedAt'
  ]];
  for(const h of (state.heats||[])){
    const rHeat = (state.results||{})[h.id] || {};
    for(const L of (h.lanes||[])){
      if(!L.pid) continue;
      const p = pMap[L.pid];
      if(!p) continue;
      const rec = rHeat[String(L.lane)] || { status:'OK', timeSec:null, note:'', updatedAt:'' };
      rows.push([
        h.grade,h.event,h.round,h.heatNo,L.lane,
        p.id,p.name,p.class,p.no,
        String(rec.status||'OK').toUpperCase(),
        (rec.timeSec===0||rec.timeSec)?rec.timeSec:'',
        rec.note||'',
        rec.updatedAt||''
      ]);
    }
  }
  const ymd = new Date().toISOString().slice(0,10).replaceAll('-','');
  downloadText(rowsToCSV(rows), `results_${ymd}.csv`, 'text/csv;charset=utf-8');
}
