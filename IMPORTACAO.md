# Importação de produtos

No menu, **Importar produtos** abre uma nova aba para preservar a tela de trabalho. Não altera retiradas, produção, pedidos, contagens salvas nem o serviço Google Apps Script.

1. Selecione um `.xlsx` de até 10 MB e a aba correta. Até 50.000 linhas e 200 colunas. O título pode ocupar linhas antes do cabeçalho.
2. Clique em **Gerar prévia**. As colunas obrigatórias são `Código do Produto`, `Descrição do Produto` e `Característica - Endereçamento`. Fórmulas e erros nessas colunas precisam ser convertidos para valores. Códigos numéricos usam o texto formatado do Excel; zeros à esquerda perdidos no próprio Excel não podem ser recuperados.
3. Confira os novos e atualizados na tabela, com filtro e páginas de 50 linhas. Baixe o backup.
4. Marque a confirmação para baixar o JSON atualizado e/ou a proposta para o GitHub. Nada é aplicado ao site nessa etapa. Cancelar descarta a prévia.

Os códigos são comparados após normalização Unicode NFKC, remoção de espaços e conversão para maiúsculas. Pontuação e zeros à esquerda são preservados. Em correspondências, o código já existente é mantido. Nome e posição vêm da planilha; posição vazia recebe `N/D`. Produtos ausentes, campos extras, ordem dos registros e duplicatas existentes são preservados. Linhas idênticas da planilha são agrupadas. Códigos com nomes ou posições conflitantes bloqueiam a importação. Linhas sem código ou descrição também bloqueiam. Por compatibilidade com a renderização atual do site, códigos e posições aceitam letras, números e `._/+-` (espaços também nas posições); descrições não aceitam marcação HTML.

## Envio seguro ao GitHub

GitHub Pages serve arquivos estáticos. A leitura e a prévia funcionam no navegador sem credenciais. A escrita no GitHub ocorre **no computador do administrador**, com Node.js 22 ou superior. O token nunca é solicitado na página, incluído nos arquivos baixados ou salvo em armazenamento do navegador.

Dentro de uma cópia local deste projeto, simule com o arquivo de proposta baixado:

```powershell
node tools/publicar-importacao.mjs 'C:\caminho\proposta-importacao.json' --dry-run
```

A ferramenta consulta a versão atual no GitHub e recusa uma proposta se a base mudou desde a prévia. Calcula novamente a importação com as mesmas regras e grava backup, diferenças e resultado em `.importacoes-locais/`, pasta ignorada pelo Git.

Para criar uma solicitação de revisão, use um token de acesso refinado restrito ao repositório `WashingtonHelena/inventarioSiloking`, com **Contents: Read and write** e **Pull requests: Read and write**. Não envie esse token em chats. No PowerShell, leia-o sem exibir e remova-o do ambiente ao terminar:

```powershell
$credencialImportacao = Get-Credential -UserName 'github' -Message 'Informe o token no campo de senha'
$env:GH_TOKEN = $credencialImportacao.GetNetworkCredential().Password
try {
  node tools/publicar-importacao.mjs 'C:\caminho\proposta-importacao.json'
} finally {
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
  $credencialImportacao = $null
}
```

Confira o `diff.json` local antes de digitar `CRIAR PROPOSTA`. O envio cria uma branch exclusiva e uma solicitação **em rascunho**, com o JSON e um backup integral no mesmo commit. A branch principal nunca é escrita pela ferramenta. Só integre no GitHub depois de revisar. Essa integração poderá acionar a publicação do Pages conforme a configuração do repositório. Antes de integrar, confira se a base de destino não recebeu outra importação; em caso de conflito ou mudança, feche a proposta antiga e gere outra prévia sobre a base atual. A prévia pública poderá precisar aguardar a atualização do Pages.

## Falhas e recuperação

- Falha de leitura, colunas ausentes, dados inválidos ou conflitos: nada é enviado. Corrija e gere nova prévia.
- HTTP 401/403: confira validade e permissões do token. HTTP 409/422 ou base alterada: refaça a prévia na versão atual. Falha de rede: confira branches e solicitações no GitHub antes de repetir.
- Se criar a branch mas falhar ao abrir a solicitação, o nome da branch será informado; abra a solicitação manualmente. O site continua sem alterações enquanto não houver integração.
- Após integrar, uma restauração pode ser revisada em uma nova solicitação usando `backups/produtos-<identificador>.json` ou revertendo o commit da importação. Não restaure sobre importações posteriores sem comparar as diferenças.
- A tela existente e suas contagens não são reescritas durante a importação. Reabra o site após a publicação para usar o catálogo novo; contagens já salvas continuam sendo registros do momento em que foram feitas.

## Verificação local

```powershell
node --test tests/*.test.mjs
python -m http.server 8080
```

Abra `http://localhost:8080/importar.html`. Não abra como `file://`, pois a leitura da base usa `fetch`. A biblioteca SheetJS CE 0.20.3 está incluída em `vendor/`, com licença Apache 2.0; a planilha não é enviada a serviços externos.
