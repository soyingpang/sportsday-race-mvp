// SheetJS (XLSX) is loaded via CDN in HTML.

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

  const cols = [{wch:6},{wch:6},{wch:14},{wch:10},{wch:10},{wch:10},{wch:18}];
  const {wb} = aoaToBook('總分表', rows, cols);
  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  XLSX.writeFile(wb, `總分表_${ts}.xlsx`);
}

export function exportAllHeatsHandwriteOneSheet(state, {sheetName='場次手寫計分表'} = {}){
  const pMap = Object.fromEntries((state.participants||[]).map(p=>[p.id,p]));
  const heats = (state.heats||[]).slice().sort((a,b)=>
    String(a.grade).localeCompare(String(b.grade)) ||
    String(a.event).localeCompare(String(b.event)) ||
    String(a.round).localeCompare(String(b.round)) ||
    (a.heatNo||0)-(b.heatNo||0) ||
    (a.createdAt||0)-(b.createdAt||0)
  );

  if(!heats.length){
    alert('尚未建立任何組次。');
    return;
  }

  const rows = [];
  const pageBreaks = []; // row indices to insert page break before
  const add = (r)=>rows.push(r);

  const headerCols = [{wch:6},{wch:8},{wch:14},{wch:10},{wch:16},{wch:8},{wch:18}];

  for(let i=0;i<heats.length;i++){
    const h = heats[i];

    // page break before each heat after first
    if(i>0){
      pageBreaks.push({r: rows.length}); // break before this row
      add([]); // small spacer
    }

    add(['年級', `${h.grade} 年級`, '', '項目', h.event, '', '']);
    add(['輪次', h.round, '', '組次', `第 ${h.heatNo} 組`, '', '']);
    add(['A 班', h.classA, '', 'B 班', h.classB, '', '']);
    add([]);
    add(['Lane','班級','姓名','成績(秒)','狀態(DNS/DNF/DQ)','名次','備註']);

    for(const L of (h.lanes||[])){
      const p = L.pid ? pMap[L.pid] : null;
      const cls = p ? p.class : (L.cls || '');
      const name = p ? p.name : '（空）';
      add([L.lane, cls, name, '', '', '', '']);
    }

    // footer spacer to help printing
    add([]);
  }

  const {wb, ws} = aoaToBook(sheetName, rows, headerCols);

  // SheetJS supports page breaks in many viewers (Excel honors them).
  ws['!rowBreaks'] = pageBreaks;

  // Freeze top row? Not ideal because multi-block; keep none to avoid odd.
  const ts = new Date().toISOString().slice(0,10).replaceAll('-','');
  XLSX.writeFile(wb, `場次手寫計分表_${ts}.xlsx`);
}

// (Optional) keep old single-heat export for future use.
export function exportHeatScoreSheet(heat){
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
