// Excel 手寫計分表匯出（SheetJS / XLSX）
// 依 heat 產出單張計分表，方便列印手寫
export function exportScoreSheet(heat, participants){
  if(typeof XLSX === 'undefined'){
    alert('缺少 XLSX 函式庫，請確認已連網載入 xlsx.full.min.js');
    return;
  }
  const pMap = Object.fromEntries((participants||[]).map(p=>[p.id,p]));
  const title = `ScoreSheet_${heat.event}_${heat.round}_H${heat.heatNo}`;

  const rows = [
    ['徑賽手寫計分表'],
    [],
    ['年級', `${heat.grade} 年級`, '項目', heat.event, '輪次', heat.round, '組次', `第 ${heat.heatNo} 組`],
    [],
    ['Lane','班級','姓名','成績(秒)','名次','備註'],
  ];

  (heat.lanes||[]).forEach(L=>{
    const p = L.pid ? pMap[L.pid] : null;
    rows.push([
      L.lane,
      p?.class || L.cls || '',
      p?.name || '',
      '',
      '',
      ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:6},{wch:8},{wch:14},{wch:10},{wch:6},{wch:18}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ScoreSheet');
  XLSX.writeFile(wb, `${title}.xlsx`);
}
