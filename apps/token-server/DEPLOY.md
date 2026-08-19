# Implantar o token server

O aplicativo não funciona sem este serviço: ele é quem guarda as chaves do
LiveKit e emite as credenciais de sala. Nenhum participante precisa dele
instalado — só precisa do endereço e do segredo do grupo.

> **Verificado em 19/08/2026.** O serviço está no ar em
> `https://nigord-token.fly.dev`, implantado do Windows com `flyctl` v0.4.84 e o
> builder remoto do Fly — não é preciso Docker na máquina. As três conferências
> da seção 4 passaram.

## 1. Chaves do LiveKit

Crie um projeto no [LiveKit Cloud](https://cloud.livekit.io) e anote:

- `LIVEKIT_URL` — algo como `wss://seu-projeto.livekit.cloud`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Essas três **nunca** saem do servidor. Não vão para o `.exe`, não vão para o
repositório (specs/room-access, "Proteção das chaves do serviço de mídia").

## 2. Segredo do grupo

É o que o app apresenta para pedir uma credencial. Gere um valor aleatório —
qualquer coisa com pelo menos 8 caracteres serve, mas não escolha à mão:

```bash
openssl rand -base64 24
```

Esse valor você passa para cada amigo, e cada um cola na tela de configuração
do app. Quem tem o segredo consegue entrar em qualquer sala; trocar é só
atualizar o servidor e avisar o grupo.

## 3. Deploy no Fly.io

Do **diretório raiz do repositório**:

```bash
fly auth login
fly apps create nigord-token --org personal
```

`fly launch` também serve, mas é interativo e propõe reescrever o `fly.toml`
que já está pronto aqui. `fly apps create` faz só o que falta. Se o nome já
estiver tomado por outra conta, escolha outro e ajuste `app` no `fly.toml`.

Depois configure os segredos (eles ficam no Fly, nunca no repositório):

```bash
fly secrets set \
  LIVEKIT_URL="wss://seu-projeto.livekit.cloud" \
  LIVEKIT_API_KEY="..." \
  LIVEKIT_API_SECRET="..." \
  NIGORD_GROUP_SECRET="..." \
  --config apps/token-server/fly.toml
```

E implante:

```bash
fly deploy --config apps/token-server/fly.toml --dockerfile apps/token-server/Dockerfile --remote-only
```

`--remote-only` constrói a imagem no builder do Fly. É o que dispensa Docker na
máquina — e no Windows é o caminho normal, não um contorno.

O Fly cria **duas** máquinas por padrão, para alta disponibilidade. Seis amigos
não precisam disso, e é franquia gasta à toa:

```bash
fly scale count 1 --app nigord-token
```

## 4. Conferir

```bash
curl https://<seu-app>.fly.dev/health
# {"ok":true}
```

E que ele recusa quem não tem o segredo:

```bash
curl -s -X POST https://<seu-app>.fly.dev/token \
  -H 'content-type: application/json' \
  -d '{"room":"sala-principal","identity":"teste"}'
# {"code":"unauthorized","message":"Invalid or missing group secret."}
```

Se as duas respostas vierem assim, o serviço está pronto. O endereço
(`https://<seu-app>.fly.dev`) e o segredo do grupo são o que cada participante
digita na primeira execução do app.

## Se falhar

O que de fato quebrou no primeiro deploy foi o **contexto de build**, não o
`pnpm install`: sem `.dockerignore` na raiz, o Docker tenta empacotar o
`node_modules` inteiro, e a árvore de links do pnpm no Windows não cabe num tar
(`archive/tar: unknown file mode ?rwxr-xr-x`). O `.dockerignore` da raiz existe
por causa disso — se alguém o remover, o deploy volta a falhar exatamente
assim.

O outro ponto provável é o `pnpm install` dentro da imagem: o `Dockerfile`
copia o manifesto do workspace, o lockfile e apenas os dois pacotes de que este
serviço depende. Se a instalação reclamar de um pacote ausente, é porque uma
dependência nova entrou no workspace e precisa ser copiada também.

O serviço falha ao iniciar de propósito quando falta qualquer chave, com a
mensagem dizendo qual — `fly logs` mostra exatamente essa linha.

## Limite de taxa atrás de proxy

O `fly.toml` já define `TRUST_PROXY=1`. Se você servir por um túnel local
(`cloudflared`), defina o mesmo no `.env`:

```
TRUST_PROXY=1
```

Sem isso, as requisições de todos os participantes chegam do mesmo endereço e o
limite de 20 por minuto passa a valer para o grupo inteiro somado — uma queda de
rede que faça todo mundo reconectar ao mesmo tempo derrubaria o resto.

## Alternativa sem deploy

Para um teste rápido, um túnel da máquina de desenvolvimento resolve, sem
conta de hospedagem nenhuma:

```bash
LIVEKIT_URL="wss://seu-projeto.livekit.cloud" \
LIVEKIT_API_KEY="..." \
LIVEKIT_API_SECRET="..." \
NIGORD_GROUP_SECRET="..." \
pnpm dev:server

cloudflared tunnel --url http://localhost:3000
```

O endereço `https://...trycloudflare.com` que ele imprime é o que vai na tela
de configuração do app. Só vale enquanto a máquina estiver ligada com o túnel
aberto.
