# Implantar o token server

O aplicativo não funciona sem este serviço: ele é quem guarda as chaves do
LiveKit e emite as credenciais de sala. Nenhum participante precisa dele
instalado — o endereço e o segredo do grupo entram no instalador no momento do
build (veja a seção 5).

> **Histórico.** Este serviço rodou no Fly.io até agosto de 2026, quando o
> trial da conta terminou e o app foi suspenso — o Fly não tem mais camada
> gratuita. A migração para Cloudflare Workers foi por causa disso. O
> `fly.toml` e o `Dockerfile` foram removidos junto.

## Por que Workers

O serviço é uma rota que assina um JWT. Não tem estado, não tem banco, não tem
disco — o que o torna adequado a um runtime sem servidor de verdade, e não só
tolerável nele.

Duas propriedades decidiram a escolha:

- **Sem cold start.** Este endpoint é a primeira coisa que roda quando alguém
  clica "Entrar". Camadas gratuitas que hibernam (Render, por exemplo) levam
  dezenas de segundos para acordar, e o app pareceria travado exatamente no
  momento em que a pessoa está olhando para ele. Isolates do Workers sobem em
  milissegundos.
- **Gratuito sem cartão**, com 100 mil requisições por dia. Seis amigos fazem
  algumas dezenas.

O que **não** roda em Workers é o `@livekit/rtc-node`, que traz um binário
nativo. O Nigord não o usa: o `livekit-server-sdk` que assina os tokens é JS
puro.

## 1. Chaves do LiveKit

Crie um projeto no [LiveKit Cloud](https://cloud.livekit.io) e anote:

- `LIVEKIT_URL` — algo como `wss://seu-projeto.livekit.cloud`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

As duas últimas **nunca** saem do servidor. Não vão para o `.exe`, não vão para
o repositório (specs/room-access, "Proteção das chaves do serviço de mídia").

`LIVEKIT_URL` não é credencial — é o endereço público do projeto — e por isso
fica em texto claro no `wrangler.jsonc`. **Edite-o lá** antes de implantar.

## 2. Segredo do grupo

É o que o app apresenta para pedir uma credencial. Gere um valor aleatório —
qualquer coisa com pelo menos 8 caracteres serve, mas não escolha à mão:

```bash
openssl rand -base64 24
```

Esse valor vai para dois lugares, e precisa ser o mesmo nos dois: um secret do
Worker (seção 3) e um secret do repositório no GitHub (seção 5).

## 3. Implantar

Do diretório `apps/token-server`:

```bash
pnpm exec wrangler login
```

Configure os três secrets. Cada comando pede o valor pelo terminal, para que
ele não fique no histórico do shell:

```bash
pnpm exec wrangler secret put LIVEKIT_API_KEY
```

```bash
pnpm exec wrangler secret put LIVEKIT_API_SECRET
```

```bash
pnpm exec wrangler secret put NIGORD_GROUP_SECRET
```

E implante:

```bash
pnpm exec wrangler deploy
```

O Wrangler imprime o endereço, algo como
`https://nigord-token.<sua-conta>.workers.dev`.

Para conferir o que vai subir sem subir nada:

```bash
pnpm exec wrangler deploy --dry-run
```

## 4. Conferir

```bash
curl https://<seu-worker>.workers.dev/health
# {"ok":true}
```

E que ele recusa quem não tem o segredo:

```bash
curl -s -X POST https://<seu-worker>.workers.dev/token \
  -H 'content-type: application/json' \
  -d '{"room":"sala-principal","identity":"teste"}'
# {"code":"unauthorized","message":"Invalid or missing group secret."}
```

Se as duas respostas vierem assim, o serviço está pronto.

## 5. Apontar o aplicativo

Não há mais tela de configuração no app. O endereço e o segredo entram no
instalador durante o build, a partir de dois secrets do repositório no GitHub —
**Settings → Secrets and variables → Actions**:

| Secret                | Valor                              |
| --------------------- | ---------------------------------- |
| `NIGORD_TOKEN_SERVER` | `https://<seu-worker>.workers.dev` |
| `NIGORD_GROUP_SECRET` | o mesmo valor definido no Worker   |

Sem eles o instalador sai vazio e recusa a entrada dizendo que saiu sem
servidor — e não há tela para corrigir depois. Trocar o segredo passa a exigir
publicar uma versão nova.

## Desenvolvimento

`wrangler dev` roda o Worker no mesmo runtime da produção (workerd), localmente:

```bash
pnpm dev:server
```

Ele lê os secrets de um arquivo `.dev.vars` em `apps/token-server`, que o
`.gitignore` da raiz cobre explicitamente — o padrão `.env.*` não o pegaria,
porque o nome não começa com `.env`.

```
LIVEKIT_API_KEY="..."
LIVEKIT_API_SECRET="..."
NIGORD_GROUP_SECRET="..."
```

O limite de taxa não é aplicado em `wrangler dev` — o binding local sempre
responde `success`. Para exercitar o comportamento limitado, os testes usam um
substituto: veja `fakeRateLimiter` em `src/app.test.ts`.

## Limite de taxa

20 requisições por minuto por endereço, configurado em `wrangler.jsonc`.

O `TRUST_PROXY` que existia na versão Fly **desapareceu**, e não por descuido:
lá, todas as requisições chegavam pelo roteador da plataforma, então sem
configurar a contagem de saltos o limite virava um orçamento único do grupo
inteiro — uma queda de rede que fizesse todo mundo reconectar junto derrubaria
o resto. No Workers a contagem usa o `CF-Connecting-IP`, que o próprio edge
escreve por cima do que o chamador mandou. Cada participante tem o seu
orçamento por construção, e o cabeçalho não é forjável.

O binding responde apenas `success`, nunca quanto falta para liberar. Por isso
o `retryAfter` da resposta 429 é a janela inteira (60s), que é o limite
superior honesto. Se você mudar o `period` no `wrangler.jsonc`, mude
`RATE_LIMIT_WINDOW_SECONDS` em `src/app.ts` junto — ele só aceita 10 ou 60.

## Se falhar

O serviço **não pode** recusar-se a iniciar quando falta uma chave, como fazia
no Fly: um Worker não tem boot, o isolate é criado sob demanda. A verificação
passou para o caminho da requisição — uma configuração incompleta responde
`server_error` em toda chamada e registra qual chave falta, e nunca assina um
token que o LiveKit rejeitaria. Os logs saem em:

```bash
pnpm exec wrangler tail
```

Se o `deploy` reclamar de `nodejs_compat`, confira se a flag continua no
`wrangler.jsonc`. `node:crypto` (`timingSafeEqual`, na comparação do segredo) e
`node:buffer` dependem dela.
