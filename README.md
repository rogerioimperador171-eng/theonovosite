# Ajude Theo — Doação via Pix (ProPix)

Site de doação com geração de Pix (QR Code + copia e cola) e confirmação
automática de pagamento. As credenciais da API ficam **apenas no servidor**
(Netlify Functions / rotas de servidor), nunca no frontend.

- API: `https://api.propixbr.com`
- Geração: `POST /api/v1/deposit`
- Consulta: `POST /api/v1/check`

## Estrutura

```
public/                     site estático (HTML/CSS/JS, design original)
public/js/pix-donation.js   fluxo de doação (modal, QR Code, polling)
netlify/functions/
  propix.mjs                integração com a API ProPix (server-side)
  pix-create.mjs            função que gera o Pix
  pix-status.mjs            função que consulta o status
netlify.toml                build, funções e redirects
src/                        versão do site servida pelo ambiente Lovable
src/lib/propix.server.ts    mesma integração para as rotas de servidor
```

O frontend chama sempre:

- `POST /api/public/pix/create` → `{ transactionId, copyPaste, qrcodeUrl, status, amount }`
- `POST /api/public/pix/status` → `{ transactionId, transactionState }`

Na Netlify esses caminhos são redirecionados para as Functions (ver `netlify.toml`).

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `PROPAY_CLIENT_ID` | Client ID da ProPix (`live_...`) |
| `PROPAY_CLIENT_SECRET` | Client Secret da ProPix (`sk_...`) |
| `PROPAY_BASE_URL` | Opcional. Padrão: `https://api.propixbr.com` |

Configurar na Netlify: **Site settings → Environment variables → Add a variable**
(marque os escopos *Builds* e *Functions*, ambiente *Production* e *Deploy previews*).
Depois de salvar, faça um novo deploy (**Deploys → Trigger deploy → Clear cache and deploy site**),
pois variáveis novas só valem para deploys posteriores.

> Se as variáveis não estiverem configuradas, a API responde com a mensagem
> "Pagamento indisponível: configure PROPAY_CLIENT_ID e PROPAY_CLIENT_SECRET…" —
> é o erro mais comum de "não gera o Pix" na Netlify.

## Publicar na Netlify

1. Suba o repositório para o GitHub/GitLab.
2. Netlify → **Add new site → Import an existing project** e escolha o repositório.
3. As configurações vêm do `netlify.toml`:
   - Build command: `echo 'Site estatico: nenhum build necessario'`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. Adicione `PROPAY_CLIENT_ID` e `PROPAY_CLIENT_SECRET` (seção acima).
5. **Deploy site**.

## Testar localmente

```bash
npm install -g netlify-cli   # ou: bun add -g netlify-cli
netlify dev
```

Crie um arquivo `.env` na raiz (baseado em `.env.example`) com as credenciais;
o `netlify dev` carrega o `.env` automaticamente e serve o site em
`http://localhost:8888` com as funções ativas.

Teste rápido das funções:

```bash
curl -X POST http://localhost:8888/api/public/pix/create \
  -H 'Content-Type: application/json' \
  -d '{"amount":15,"description":"teste"}'

curl -X POST http://localhost:8888/api/public/pix/status \
  -H 'Content-Type: application/json' \
  -d '{"transactionId":"COLE_O_ID_AQUI"}'
```

## Alterar Client ID / Client Secret

Basta trocar os valores das variáveis `PROPAY_CLIENT_ID` e `PROPAY_CLIENT_SECRET`
(na Netlify ou no `.env` local) e refazer o deploy. Nenhuma alteração de código
é necessária — as credenciais não existem em nenhum arquivo do projeto.

## Atualizar a API no futuro

Toda a comunicação com a ProPix está concentrada em dois arquivos espelhados:

- `netlify/functions/propix.mjs` (produção na Netlify)
- `src/lib/propix.server.ts` (ambiente Lovable)

Para mudar endpoints, campos enviados ou nomes de campos da resposta, edite
`createDeposit` / `checkDeposit` nesses arquivos. A leitura da resposta usa uma
lista de nomes alternativos (`copyPaste`, `copiaECola`, `qrcode`…), então basta
acrescentar o novo nome à lista caso a API mude. Para trocar a URL base, use a
variável `PROPAY_BASE_URL`.

## Fluxo de pagamento

1. Usuário escolhe o valor e clica em **PAGAR COM PIX**.
2. Frontend chama `/api/public/pix/create`; a função envia `amount`,
   `description`, `payerName` e `payerDocument` com os headers
   `x-client-id` / `x-client-secret`.
3. QR Code, Pix copia e cola, botão **COPIAR PIX** e status
   "Aguardando pagamento" aparecem imediatamente; `transactionId` é guardado.
4. Polling a cada 3s em `/api/public/pix/status`. Quando `transactionState`
   for `COMPLETO`, o polling para e a tela de pagamento aprovado aparece,
   sem recarregar a página.
5. Erros da API e timeouts exibem mensagem amigável com opção de tentar novamente.
