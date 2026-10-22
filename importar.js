'use strict';
const el=id=>document.getElementById(id);
let baseText,base,baseHash,workbook,preview,page=0,version=0,baseReady=false;
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');
function status(message,error=false){el('status').textContent=message;el('status').classList.toggle('error',error);}
function reset(){version++;preview=null;page=0;el('preview').hidden=true;el('confirmar').checked=false;el('json').disabled=true;el('proposta').disabled=true;el('filtro').value='';}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function render(){
  const q=el('filtro').value.trim().toUpperCase();
  const rows=preview.changes.filter(c=>[c.codigo,c.antes?.nome,c.depois.nome].some(v=>String(v||'').toUpperCase().includes(q)));
  const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages-1);el('diff').replaceChildren();
  rows.slice(page*50,(page+1)*50).forEach(c=>{const tr=document.createElement('tr');[c.tipo,c.codigo,c.antes?.nome||'—',c.depois.nome,c.antes?.posicao||'—',c.depois.posicao].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});el('diff').append(tr);});
  el('pagina').textContent=`Página ${page+1} de ${pages} · ${rows.length} diferenças`;
  el('anterior').disabled=page===0;el('proxima').disabled=page>=pages-1;
}
async function loadBase(){
  try{const r=await fetch('produtos_base_completa.json',{cache:'no-store'});if(!r.ok) throw Error(`HTTP ${r.status}`);baseText=await r.text();base=JSON.parse(baseText.replace(/^\uFEFF/,''));baseHash=await digest(baseText);ImportProducts.merge(base,[base[0]]);baseReady=true;el('analisar').disabled=!workbook;status(`Base atual carregada: ${base.length} registros. Selecione a planilha.`);}
  catch{status('Não foi possível carregar a base atual. Recarregue a página. Nenhuma alteração foi feita.',true);}
}
el('arquivo').addEventListener('change',async()=>{
  reset();const attempt=version;workbook=null;el('aba').replaceChildren();el('aba').disabled=true;el('analisar').disabled=true;
  const file=el('arquivo').files[0];if(!file)return;
  try{
    if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw Error('Selecione um arquivo .xlsx de até 10 MB.');
    if(!globalThis.XLSX)throw Error('Leitor Excel indisponível. Recarregue a página.');
    const data=await file.arrayBuffer();if(attempt!==version)return;
    workbook=XLSX.read(data,{type:'array',cellFormula:true,sheetRows:50002});
    workbook.SheetNames.forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;el('aba').append(option);});
    if(!workbook.SheetNames.length)throw Error('Planilha sem abas.');
    el('aba').disabled=false;el('analisar').disabled=!baseReady;status('Escolha a aba e gere a prévia.');
  }catch(e){workbook=null;status('Erro ao ler Excel: '+e.message,true);}
});
el('aba').addEventListener('change',()=>{reset();status('Aba alterada. Gere uma nova prévia.');});
el('analisar').addEventListener('click',()=>{
  reset();try{
    if(!baseReady||!workbook)throw Error('Aguarde a base e selecione uma planilha.');
    const sheet=workbook.Sheets[el('aba').value];
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
    if(range.e.r>=50000||range.e.c>=200)throw Error('A aba excede o limite de 50.000 linhas ou 200 colunas.');
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true,range:0});
    const parsed=ImportProducts.parseRows(rows);
    for(let row=parsed.headerRow+1;row<=range.e.r;row++)for(const col of parsed.columns){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(cell&&(cell.f||cell.t==='e'))throw Error(`Linha ${row+1}: substitua fórmulas e erros das colunas obrigatórias por valores.`);}
    preview=ImportProducts.merge(base,parsed.items);
    const s=preview.summary;el('summary').textContent=`${s.added} novos · ${s.updated} registros atualizados · ${s.unchanged} sem alteração · ${s.retained} ausentes da planilha mantidos · ${s.total} registros no resultado.`;
    el('warnings').replaceChildren();preview.warnings.forEach(w=>{const li=document.createElement('li');li.textContent=w;el('warnings').append(li);});
    el('preview').hidden=false;render();status(preview.changes.length?'Prévia pronta. Confira a tabela antes de confirmar.':'Nenhuma alteração necessária.');
  }catch(e){reset();status(e.message,true);}
});
el('confirmar').addEventListener('change',()=>{const enabled=!!preview?.changes.length&&el('confirmar').checked;el('json').disabled=!enabled;el('proposta').disabled=!enabled;});
el('backup').addEventListener('click',()=>download('produtos_backup.json',baseText));
el('json').addEventListener('click',()=>{if(preview&&el('confirmar').checked)download('produtos_base_completa.json',JSON.stringify(preview.result,null,2)+'\n');});
el('proposta').addEventListener('click',()=>{if(preview&&el('confirmar').checked)download('proposta-importacao.json',JSON.stringify({schemaVersion:1,baseSha256:baseHash,items:preview.items},null,2)+'\n');});
el('filtro').addEventListener('input',()=>{page=0;render();});
el('anterior').addEventListener('click',()=>{page--;render();});el('proxima').addEventListener('click',()=>{page++;render();});
el('cancelar').addEventListener('click',()=>{reset();status('Prévia cancelada. Nenhuma alteração foi feita.');});
loadBase();
