// 匯出工具：優先使用 SheetJS (XLSX)；若 CDN 失敗或離線，則自動改為 CSV 下載。
// 目的：現場無網路仍可交件（Excel 可直接開 CSV）。

function hasXLSX(){
  return (typeof XLSX !== 'undefined') && XLSX?.utils && typeof XLSX.writeFile === 'function';
}

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function aoaToCSV(rows){
  const esc = (v)=>{
    const s = (v==null) ? '' : String(v);
    if(/[",\n\r]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
    return s;
  };
  return rows.map(r=> (r||[]).map(esc).join(',')).join('\r\n');
}

// Build a workbook with a single sheet from AOA.
function aoaToBook(sheetName, rows, cols){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if(cols) ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return {wb, ws};
}

export function exportTotalScoreSheet(state){
  const cats = state.categories || {c1:'類別1',c2:'類別2',c3:'類別3'};
  const people = (state.participants||[])
    .filter(p=>p.present)
    .slice()
    .sort((a,b)=> String(a.class).localeCompare(String(b.class),'zh-Hant') || (a.no||0)-(b.no||0));

  const rows = [
    ['班別','座號','姓名', cats.c1 || '類別1', cats.c2 || '類別2', cats.c3 || '類別3', '備註']
  ];
  for(const p of people){
    rows.push([p.class, p.no, p.name, '', '', '', '']);
  }

  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  if(hasXLSX()){
    const cols = [{wch:6},{wch:6},{wch:14},{wch:10},{wch:10},{wch:10},{wch:18}];
    const {wb} = aoaToBook('總分表', rows, cols);
    XLSX.writeFile(wb, `總分表_${ts}.xlsx`);
  }else{
    const csv = aoaToCSV(rows);
    downloadBlob(new Blob([csv], {type:'text/csv;charset=utf-8'}), `總分表_${ts}.csv`);
    alert('⚠️ 目前無法載入 XLSX 匯出（可能離線/被擋）。已改用 CSV 下載，可用 Excel 開啟。');
  }
}

// (Optional) keep old single-heat export for future use.
export function exportHeatScoreSheet(heat){
  if(!hasXLSX()){
    alert('目前無法載入 XLSX 匯出（可能離線/被擋）。');
    return;
  }
  const rows = [
    ['年級', heat.grade],
    ['項目', heat.event],
    ['組次', heat.heatNo],
    [],
    ['Lane','班級','姓名','成績(秒)','狀態(DNS/DNF/DQ)','名次','備註']
  ];
  for(const L of (heat.lanes||[])){
    rows.push([L.lane, L.cls || '', '', '', '', '', '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:6},{wch:8},{wch:14},{wch:10},{wch:16},{wch:8},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ScoreSheet');
  XLSX.writeFile(wb, `ScoreSheet_${heat.event}_H${heat.heatNo}.xlsx`);
}

export function exportBackupJSON(state){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadBlob(blob, `backup-${ts}.json`);
}

export function exportHandScoreSheet(state){
  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const heats = (state.heats||[]).slice().sort((a,b)=>
    String(a.event||'').localeCompare(String(b.event||''),'zh-Hant') ||
    (a.heatNo||0)-(b.heatNo||0) ||
    (a.createdAt||0)-(b.createdAt||0)
  );

  const rows = [];
  rows.push(['親子遊戲日 手寫計分表（4 道）']);
  rows.push(['匯出時間', new Date().toLocaleString('zh-Hant')]);
  rows.push([]);
  rows.push(['項目','組次','Lane1','Lane2','Lane3','Lane4','時間/成績','名次','備註']);

  const nameOfLane = (laneObj)=>{
    if(!laneObj) return '（空）';
    const p = laneObj.pid ? pMap[laneObj.pid] : null;
    if(p) return `${p.class} ${p.name}`;
    // fallback (若是已寫入 cls/name)
    const cls = laneObj.cls ? String(laneObj.cls) : '';
    const nm = laneObj.name ? String(laneObj.name) : '';
    return (cls && nm) ? `${cls} ${nm}` : (nm || cls || '（空）');
  };

  for(const h of heats){
    const lanesByNo = {};
    for(const L of (h.lanes||[])) lanesByNo[L.lane]=L;
    rows.push([
      h.event || '',
      h.heatNo || '',
      nameOfLane(lanesByNo[1]),
      nameOfLane(lanesByNo[2]),
      nameOfLane(lanesByNo[3]),
      nameOfLane(lanesByNo[4]),
      '', '', ''
    ]);
  }

  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  if(hasXLSX()){
    const cols = [
      {wch:18},{wch:6},{wch:18},{wch:18},{wch:18},{wch:18},{wch:12},{wch:6},{wch:14}
    ];
    const {wb} = aoaToBook('手寫計分表', rows, cols);
    XLSX.writeFile(wb, `手寫計分表-${new Date().toISOString().slice(0,10)}.xlsx`);
  }else{
    const csv = aoaToCSV(rows);
    downloadBlob(new Blob([csv], {type:'text/csv;charset=utf-8'}), `手寫計分表_${ts}.csv`);
    alert('⚠️ 目前無法載入 XLSX 匯出（可能離線/被擋）。已改用 CSV 下載，可用 Excel 開啟。');
  }
}
