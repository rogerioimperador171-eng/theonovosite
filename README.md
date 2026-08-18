# Ajude Theo — Doação via Pix (ProPix)

Site de arrecadação com geração de Pix (QR Code + copia e cola) através da API **ProPix**
(`https://api.propixbr.com`). As credenciais ficam sempre no servidor — nunca no frontend.

## Estrutura

```
public/                      site estático (HTML, CSS, JS, imagens, fontes)
  index.html                 página da campanha (seção "QUAL VALOR VOCÊ DESEJA DOAR?")
  css/pix-donation.css       estilos do novo módulo de doação (arquivo novo)
  js/pix-donation.js         lógica de doação: valores, order bump, Pix, polling
netlify/functions/
  pix-create.mts             gera o Pix (POST /api/v1/deposit)
  pix-status.mts             consulta o pagamento (POST /api/v1/check)
src/lib/propix.server.ts     integração compartilhada com a API ProPix
src/routes/api/public/pix/   mesmas rotas para o preview/hospedagem Lovable
netlify.toml                 configuração de deploy + redirects das funções
```

O frontend chama sempre:

- `POST /api/public/pix/create`
- `POST /api/public/pix/status`

Na Netlify esses caminhos são redirecionados para as Functions; na Lovable são atendidos
pelas rotas de servidor equivalentes. Ou seja, o mesmo código funciona nos dois lugares.

## Como funciona a doação

1. O visitante escolhe um valor (R$ 30, 40, 50, 70, 100, 150, 200, 300, 500, 750, 1.000) ou
   digita um valor personalizado (mínimo **R$ 15,00**).
2. Abre o modal com o banner do Theo e o **order bump** "Ajudar com medicamentos" (+ R$ 10,00).
3. Ao clicar em **Doar**, a função serverless chama `POST /api/v1/deposit` com os headers
   `x-client-id`, `x-client-secret` e `Content-Type: application/json`, enviando
   `amount`, `description`, `payerName` e `payerDocument`.
4. O modal exibe imediatamente o **QR Code**, o **Pix copia e cola**, o botão **Copiar código Pix**,
   as instruções de pagamento, o status "Aguardando pagamento" e os dados do recebedor
   (Instituição: ProPix / nome do destinatário).
5. A cada 3 segundos o site consulta `POST /api/v1/check` com o `transactionId`. Quando o
   `transactionState` for `COMPLETO`, o polling para e a tela de pagamento aprovado aparece
   sem recarregar a página.

Erros da API mostram uma mensagem amigável com botão **Tentar novamente**; timeouts (30s)
também permitem nova tentativa. O site nunca quebra.

## Variáveis de ambiente

| Nome                   | Descrição                        |
| ---------------------- | -------------------------------- |
| `PROPAY_CLIENT_ID`     | Client ID da ProPix (`live_...`) |
| `PROPAY_CLIENT_SECRET` | Client Secret da ProPix (`sk_...`) |

### Na Netlify

1. Acesse **Site configuration → Environment variables**.
2. Clique em **Add a variable** e cadastre `PROPAY_CLIENT_ID` e `PROPAY_CLIENT_SECRET`.
3. Faça um novo deploy (**Deploys → Trigger deploy → Clear cache and deploy site**).

### Na Lovable

As mesmas variáveis já estão salvas nos secrets do projeto e são lidas pelas rotas de servidor.

## Publicar na Netlify

1. Conecte o repositório em **Add new site → Import an existing project** (ou arraste a pasta).
2. A Netlify lê o `netlify.toml`:
   - publish: `public`
   - functions: `netlify/functions`
3. Cadastre as variáveis de ambiente (acima) e faça o deploy.

## Testar localmente

```bash
npm install
npx netlify dev      # site em http://localhost:8888 com as Functions ativas
```

Crie um arquivo `.env` local (não versionado) com:

```
PROPAY_CLIENT_ID=live_...
PROPAY_CLIENT_SECRET=sk_...
```

## Alterar Client ID / Client Secret

Basta atualizar as variáveis `PROPAY_CLIENT_ID` e `PROPAY_CLIENT_SECRET` no painel da Netlify
(ou nos secrets da Lovable) e refazer o deploy. **Nenhum arquivo de código precisa ser alterado.**

## Atualizar a API no futuro

Toda a comunicação com a ProPix está em `src/lib/propix.server.ts`:

- `PROPIX_BASE_URL` — altere aqui se a URL base mudar.
- `createDeposit()` — endpoint `/api/v1/deposit` e campos enviados.
- `checkDeposit()` — endpoint `/api/v1/check` e leitura do `transactionState`.

As duas Netlify Functions e as rotas da Lovable apenas reutilizam essas funções, então uma
mudança nesse arquivo vale para todos os ambientes.
