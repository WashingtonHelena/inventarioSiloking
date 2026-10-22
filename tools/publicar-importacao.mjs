// Run locally with Node 22+. Credentials are read only from the process environment.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import core from '../import-core.js';

export const repository='WashingtonHelena/inventarioSiloking';
const productPath='produtos_base_completa.json';
export const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
export function prepare(proposal,current){
  if(proposal?.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(proposal.baseSha256||''))throw Error('Proposta inválida. Gere uma nova prévia no site.');
  if(proposal.baseSha256!==hash(current))throw Error('A base do GitHub mudou desde a prévia. Recarregue o site e refaça a importação.');
  return core.merge(JSON.parse(current.replace(/^\uFEFF/,'')),proposal.items);
}
export function client(token,fetchImpl=fetch){
  return async (path,method='GET',body)=>{
    let r;
    try{r=await fetchImpl(`https://api.github.com/repos/${repository}${path}`,{
      method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });}catch{throw Error(`Falha de rede no GitHub (${method} ${path}). Não repita o envio sem conferir as branches existentes.`);}
    if(!r.ok)throw Error(`GitHub HTTP ${r.status} (${method} ${path}). Confira permissões, limite de uso e conexão.`);
    return r.json();
  };
}
export async function snapshot(api){
  const repo=await api('');
  const branch=repo.default_branch;
  const ref=await api(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const sha=ref.object.sha;
  const file=await api(`/contents/${productPath}?ref=${sha}`);
  if(file.encoding!=='base64'||!file.content)throw Error('Não foi possível ler o JSON atual no GitHub.');
  return {branch,sha,current:Buffer.from(file.content,'base64').toString('utf8')};
}
export async function publish(api,state,prepared,id){
  // Recheck immediately before writing. The default branch is never written.
  const latest=await api(`/git/ref/heads/${encodeURIComponent(state.branch)}`);
  if(latest.object.sha!==state.sha)throw Error('O repositório mudou durante a confirmação. Recomece para evitar sobrescrever alterações.');
  const parent=await api(`/git/commits/${state.sha}`);
  const branch=`importacao-produtos/${id}`;
  const backupPath=`backups/produtos-${id}.json`;
  const tree=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree:[
    {path:productPath,mode:'100644',type:'blob',content:JSON.stringify(prepared.result,null,2)+'\n'},
    {path:backupPath,mode:'100644',type:'blob',content:state.current}
  ]});
  const commit=await api('/git/commits','POST',{message:'Importar produtos do Excel com backup',tree:tree.sha,parents:[state.sha]});
  await api('/git/refs','POST',{ref:`refs/heads/${branch}`,sha:commit.sha});
  try{
    const s=prepared.summary;
    return await api('/pulls','POST',{title:'Atualizar produtos pela planilha Excel',head:branch,base:state.branch,
      body:`Importação confirmada após prévia: ${s.added} novos, ${s.updated} atualizados e ${s.retained} ausentes mantidos.\n\nBackup integral em \`${backupPath}\`. Base original: ${state.sha}.\n\nRevisar as diferenças antes de integrar. Esta ferramenta não integra nem publica o site.`,draft:true});
  }catch(e){throw Error(`${e.message}\nA branch ${branch} já contém a alteração e o backup. Abra a solicitação manualmente no GitHub; não é necessário reenviar.`);}
}
async function main(){
  const args=process.argv.slice(2),dry=args.includes('--dry-run'),file=args.find(a=>!a.startsWith('--'));
  if(!file||args.some(a=>a.startsWith('--')&&a!=='--dry-run'))throw Error('Uso: node tools/publicar-importacao.mjs caminho/proposta-importacao.json [--dry-run]');
  const raw=await readFile(file,'utf8');if(Buffer.byteLength(raw)>20*1024*1024)throw Error('Proposta maior que 20 MB.');
  const proposal=JSON.parse(raw),api=client(process.env.GH_TOKEN),state=await snapshot(api),prepared=prepare(proposal,state.current);
  console.log(repository);console.log(JSON.stringify(prepared.summary,null,2));prepared.warnings.forEach(w=>console.log(w));
  if(!prepared.changes.length){console.log('Nenhuma alteração necessária.');return;}
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
  const dir=new URL(`../.importacoes-locais/${id}/`,import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL('backup.json',dir),state.current,{flag:'wx'});
  await writeFile(new URL('diff.json',dir),JSON.stringify(prepared.changes,null,2),{flag:'wx'});
  await writeFile(new URL('produtos_base_completa.json',dir),JSON.stringify(prepared.result,null,2)+'\n',{flag:'wx'});
  console.log(`Backup, diferenças e resultado local: ${dir.pathname}`);
  if(dry){console.log('Simulação concluída. Nenhuma escrita no GitHub.');return;}
  if(!process.env.GH_TOKEN)throw Error('Defina GH_TOKEN apenas no ambiente local. Nunca coloque o token no site, na proposta ou no repositório.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  let answer;try{answer=await rl.question('Confira diff.json. Digite CRIAR PROPOSTA para criar uma branch e solicitação de revisão no GitHub: ');}finally{rl.close();}
  if(answer!=='CRIAR PROPOSTA'){console.log('Cancelado. Nenhuma escrita no GitHub.');return;}
  console.log(`Branch planejada: importacao-produtos/${id}. Em caso de interrupção, confira essa branch antes de reenviar.`);
  const pr=await publish(api,state,prepared,id);
  console.log(`Proposta criada: ${pr.html_url}\nRevise no GitHub. Nenhuma integração ou publicação foi feita.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
