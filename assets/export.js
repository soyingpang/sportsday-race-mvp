// SheetJS (XLSX) is loaded via CDN in HTML.

function aoaToBook(sheetName, rows){
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // column widths (rough)
  ws['!cols'] = [
    {wch:6},  // 班別
    {wch:6},  // 座號
    {wch:14}, // 姓名
    {wch:10}, // 類別1
    {wch:10}, // 類別2
    {wch:10}, // 類別3
    {wch:18}, // 備註
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
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

  const wb = aoaToBook('總分表', rows);
  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  XLSX.writeFile(wb, `總分表_${ts}.xlsx`);
}

export function exportHeatScoreSheet(heat){
  // 保留舊功能：單一組次手寫計分表（如果你未來還要）
  const rows = [
    ['年級', heat.grade],
    ['項目', heat.event],
    ['輪次', heat.round],
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
