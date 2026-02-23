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


// 匯出「全部組次」成單一 Excel（含：總覽 + 每組一張工作表）
export function exportAllScoreSheets(heats, participants){
  if(typeof XLSX === 'undefined'){
    alert('缺少 XLSX 函式庫，請確認已連網載入 xlsx.full.min.js');
    return;
  }
  const pMap = Object.fromEntries((participants||[]).map(p=>[p.id,p]));
  const wb = XLSX.utils.book_new();

  // 1) Overview sheet
  const overview = [
    ['全部組次道次總覽（手寫用）'],
    ['匯出時間', new Date().toLocaleString('zh-Hant-TW',{hour12:false})],
    [],
    ['年級','項目','輪次','組次','A班','B班',
     'Lane1 班級','Lane1 姓名','Lane2 班級','Lane2 姓名','Lane3 班級','Lane3 姓名','Lane4 班級','Lane4 姓名']
  ];
  (heats||[]).slice().sort((a,b)=>a.createdAt-b.createdAt).forEach(h=>{
    const cells = [h.grade, h.event, h.round, h.heatNo, h.classA, h.classB];
    h.lanes.forEach(L=>{
      const p = L.pid ? pMap[L.pid] : null;
      cells.push(p ? p.class : (L.cls||''), p ? p.name : '');
    });
    overview.push(cells);
  });
  const ws0 = XLSX.utils.aoa_to_sheet(overview);
  ws0['!cols'] = Array(14).fill({wch:14});
  XLSX.utils.book_append_sheet(wb, ws0, '總覽');

  // 2) One sheet per heat
  (heats||[]).slice().sort((a,b)=>a.createdAt-b.createdAt).forEach((h,ix)=>{
    const title = `H${h.heatNo}_${h.event}_${h.round}`.slice(0,31);
    const rows = [
      ['徑賽手寫計分表'],
      ['年級', h.grade],
      ['項目', h.event],
      ['輪次', h.round],
      ['組次', h.heatNo],
      ['A班', h.classA],
      ['B班', h.classB],
      [],
      ['Lane','班級','姓名','成績(秒)','名次','備註']
    ];
    h.lanes.forEach(L=>{
      const p = L.pid ? pMap[L.pid] : null;
      rows.push([
        L.lane,
        p ? p.class : (L.cls||''),
        p ? p.name : '',
        '',
        '',
        ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:8},{wch:10},{wch:14},{wch:12},{wch:8},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws, title || `H${ix+1}`);
  });

  const file = `All_ScoreSheets_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, file);
}
