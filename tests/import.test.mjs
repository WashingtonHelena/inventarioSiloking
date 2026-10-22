import {test} from 'node:test';
import assert from 'node:assert/strict';
import core from '../import-core.js';
import {prepare,hash,publish,client} from '../tools/publicar-importacao.mjs';
const old=[{posicao:'A1',codigo:'SB001',nome:'Antigo',extra:42},{posicao:'B1',codigo:'0002',nome:'Ausente'}];
test('normalization keeps zeros and punctuation',()=>{
  assert.equal(core.normalizeCode(' ｓｂ ００１ '),'SB001');assert.equal(core.normalizeCode('00-2'),'00-2');
});
test('adds, updates and retains absent data without mutating base',()=>{
  const before=JSON.stringify(old),p=core.merge(old,[{codigo:'sb 001',nome:'Novo',posicao:''},{codigo:'003',nome:'Terceiro',posicao:'C1'}]);
  assert.deepEqual(p.summary,{added:1,updated:1,retained:1,unchanged:0,total:3,repeated:0});
  assert.deepEqual(p.result[0],{posicao:'N/D',codigo:'SB001',nome:'Novo',extra:42});assert.deepEqual(p.result[1],old[1]);assert.equal(JSON.stringify(old),before);
});
test('existing duplicates preserved and all matches updated',()=>{
  const p=core.merge([old[0],{...old[0]}],[{codigo:'SB001',nome:'Atualizado',posicao:'F'}]);
  assert.equal(p.result.length,2);assert.equal(p.summary.updated,2);assert.equal(p.warnings.length,1);
});
test('identical Excel duplicates coalesced; conflicting duplicates rejected',()=>{
  assert.equal(core.merge(old,[old[0],old[0]]).summary.repeated,1);
  assert.throws(()=>core.merge(old,[old[0],{...old[0],posicao:'Z'}]),/conflit|diferentes/);
});
test('headers found after title; blank rows ignored; blank position N/D',()=>{
  const p=core.parseRows([['Título'],core.headers,['001','Produto',''],['','','']]);assert.equal(p.items[0].posicao,'N/D');assert.equal(p.items[0].codigo,'001');
  assert.throws(()=>core.parseRows([['wrong']]),/Colunas/);
  assert.throws(()=>core.parseRows([core.headers,['','Nome','A']]),/obrigatórios/);
  assert.throws(()=>core.parseRows([[...core.headers,core.headers[0]],['A','Nome','A','A']]),/duplicadas/);
});
test('unsafe input and empty import refused',()=>{
  assert.throws(()=>core.merge(old,[]));assert.throws(()=>core.merge(old,[{codigo:'a',nome:'<img src=x onerror=alert(1)>',posicao:'A'}]),/marcação/);
  assert.throws(()=>core.merge(old,[{codigo:'a',nome:'Produto',posicao:"A');alert(1)//"}]),/inválidos/);
});
test('proposal recomputed locally and stale base blocked',()=>{
  const text=JSON.stringify(old),proposal={schemaVersion:1,baseSha256:hash(text),items:[old[0]]};
  assert.equal(prepare(proposal,text).summary.total,2);assert.throws(()=>prepare(proposal,text+' '),/mudou/);
});
test('atomic tree contains exact backup; only creates a new branch and draft PR',async()=>{
  const calls=[],state={sha:'parent',branch:'main',current:JSON.stringify(old)};
  const api=async(path,method='GET',body)=>{calls.push({path,method,body});if(path.includes('/git/ref/'))return {object:{sha:'parent'}};if(path==='/git/commits/parent')return {tree:{sha:'old-tree'}};if(path==='/git/trees')return {sha:'new-tree'};if(path==='/git/commits')return {sha:'new-commit'};return {html_url:'https://github.com/example/pr/1'};};
  await publish(api,state,core.merge(old,[{...old[0],nome:'Novo'}]),'test-id');
  const tree=calls.find(c=>c.path==='/git/trees').body;assert.equal(tree.base_tree,'old-tree');assert.equal(tree.tree[1].content,state.current);
  assert.equal(calls.find(c=>c.path==='/git/refs').body.ref,'refs/heads/importacao-produtos/test-id');
  assert.equal(calls.at(-1).body.draft,true);assert.equal(calls.at(-1).body.base,'main');assert(!calls.some(c=>c.method==='PATCH'||c.method==='PUT'||c.method==='DELETE'));
});
test('concurrent repo change prevents any write',async()=>{
  const calls=[];await assert.rejects(()=>publish(async(p,m='GET')=>{calls.push(m);return {object:{sha:'changed'}};},{branch:'main',sha:'old'},null,'x'),/mudou/);assert.deepEqual(calls,['GET']);
});
test('partial PR failure identifies recoverable branch',async()=>{
  const api=async p=>{if(p.includes('/git/ref/'))return {object:{sha:'x'}};if(p==='/git/commits/x')return {tree:{sha:'tree'}};if(p==='/pulls')throw Error('HTTP 403');return {sha:'new'};};
  await assert.rejects(()=>publish(api,{branch:'main',sha:'x',current:'[]'},core.merge(old,[{...old[0],nome:'Novo'}]),'recover'),/branch importacao-produtos\/recover já contém/);
});
test('HTTP and network errors never echo credentials or server content',async()=>{
  const api=client('secret',async()=>({ok:false,status:403,json:()=>({message:'secret'})}));await assert.rejects(()=>api('/pulls'),e=>e.message.includes('403')&&!e.message.includes('secret'));
  await assert.rejects(()=>client('secret',async()=>{throw Error('secret');})(''),e=>!e.message.includes('secret'));
});
