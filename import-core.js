/* Shared by the preview and the local GitHub publisher. No network or credentials. */
(function(root){
  'use strict';
  const headers=['Código do Produto','Descrição do Produto','Característica - Endereçamento'];
  const text=v=>v==null?'':String(v).trim();
  const normalizeCode=v=>text(v).normalize('NFKC').replace(/\s+/gu,'').toUpperCase();
  const header=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  function cleanItem(v,where){
    if(!v || typeof v!=='object') throw Error(`${where}: produto inválido.`);
    const p={codigo:normalizeCode(v.codigo),nome:text(v.nome),posicao:text(v.posicao)||'N/D'};
    if(!p.codigo||!p.nome) throw Error(`${where}: código e descrição são obrigatórios.`);
    if(!/^[\p{L}\p{N}._/+\-]+$/u.test(p.codigo)) throw Error(`${where}: código contém caracteres inválidos.`);
    if(!/^[\p{L}\p{N}\s._/+\-]+$/u.test(p.posicao)) throw Error(`${where}: endereçamento contém caracteres inválidos.`);
    if(/<[a-z/!?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(p.nome)) throw Error(`${where}: descrição contém marcação ou caracteres de controle.`);
    return p;
  }
  function parseRows(rows){
    const wanted=headers.map(header);
    const h=rows.slice(0,50).findIndex(r=>wanted.every(w=>r.map(header).includes(w)));
    if(h<0) throw Error('Colunas obrigatórias não encontradas: '+headers.join(', '));
    const titles=rows[h].map(header);
    if(wanted.some(w=>titles.filter(t=>t===w).length!==1)) throw Error('Há colunas obrigatórias duplicadas.');
    const cols=wanted.map(w=>titles.indexOf(w));
    const items=[];
    rows.slice(h+1).forEach((r,i)=>{
      if(!r.some(v=>text(v))) return;
      items.push(cleanItem({codigo:r[cols[0]],nome:r[cols[1]],posicao:r[cols[2]]},`Linha ${h+i+2}`));
    });
    if(!items.length) throw Error('A planilha não contém produtos.');
    return {items,headerRow:h,columns:cols};
  }
  function merge(base,incoming){
    if(!Array.isArray(base)||!base.length) throw Error('Base atual vazia ou inválida.');
    if(!Array.isArray(incoming)||!incoming.length||incoming.length>50000) throw Error('Quantidade de produtos inválida (limite: 50.000 linhas).');
    const source=new Map(),warnings=[],conflicts=[];
    let repeated=0;
    incoming.forEach((v,i)=>{
      const p=cleanItem(v,`Produto ${i+1}`),old=source.get(p.codigo);
      if(old){
        if(old.nome!==p.nome||old.posicao!==p.posicao) conflicts.push(p.codigo);
        else repeated++;
      }else source.set(p.codigo,p);
    });
    if(conflicts.length) throw Error('Códigos repetidos com nomes ou posições diferentes. Corrija a planilha: '+[...new Set(conflicts)].join(', '));
    if(repeated) warnings.push(`${repeated} linhas repetidas idênticas agrupadas.`);
    const seen=new Set(),changes=[],result=[];
    let retained=0,unchanged=0,updated=0,added=0,duplicates=0;
    base.forEach((v,i)=>{
      if(!v||typeof v!=='object'||!normalizeCode(v.codigo)||typeof v.nome!=='string'||typeof v.posicao!=='string') throw Error(`Base atual inválida no item ${i+1}.`);
      const key=normalizeCode(v.codigo),p=source.get(key);
      if(seen.has(key)) duplicates++;
      seen.add(key);
      if(!p){result.push({...v});retained++;return;}
      // Keep existing identifiers, extra fields, ordering and duplicate records.
      const after={...v,nome:p.nome,posicao:p.posicao};
      result.push(after);
      if(v.nome!==after.nome||v.posicao!==after.posicao){
        updated++;changes.push({tipo:'Atualizado',codigo:v.codigo,antes:{...v},depois:after});
      }else unchanged++;
    });
    source.forEach((p,k)=>{if(!seen.has(k)){const after={posicao:p.posicao,codigo:p.codigo,nome:p.nome};result.push(after);added++;changes.push({tipo:'Novo',codigo:p.codigo,antes:null,depois:after});}});
    if(duplicates) warnings.push(duplicates===1?'1 registro duplicado da base foi preservado; correspondências serão atualizadas em ambos os registros.':`${duplicates} registros duplicados da base foram preservados; correspondências serão atualizadas em todos eles.`);
    return {result,changes,warnings,items:[...source.values()],summary:{added,updated,retained,unchanged,total:result.length,repeated}};
  }
  const api={headers,normalizeCode,parseRows,merge};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.ImportProducts=api;
})(typeof globalThis!=='undefined'?globalThis:this);
