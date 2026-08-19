## Why

A primeira sessão real com duas pessoas mostrou que **nenhum áudio remoto é
audível** — nem a voz, nem o som do jogo — e que a tela chega a 960×540 embora
seja capturada em 1920×1080. O aplicativo existe para que amigos conversem e
mostrem a tela com o som junto; hoje ele entrega apenas a imagem, em metade da
resolução.

As três falhas foram medidas, não deduzidas:

| Medição                                        | Resultado                            |
| ---------------------------------------------- | ------------------------------------ |
| Elementos `<audio>` na página, dos dois lados   | `0`, em todos os momentos            |
| Vídeo recebido, com o elemento esticado a 1920 | `960×540`                            |
| Captura na origem                              | `1920×1080 @ 60fps`                  |
| Faixa de loopback entregue pelo sistema        | `echoCancellation: true`, mono       |

## What Changes

- **Reproduzir o áudio remoto.** As faixas recebidas são assinadas e nunca
  anexadas a um elemento de mídia — o `livekit-client` só toca o que a
  aplicação anexa. Vale para a voz e para o áudio do sistema, que é a mesma
  omissão vista duas vezes.
- **Tratar o bloqueio de reprodução automática.** Quando o navegador recusa
  tocar, o participante precisa saber e ter como autorizar, em vez de ficar num
  silêncio indistinguível do bug atual.
- **Aplicar as restrições do áudio do sistema na captura.** `systemAudioConstraints()`
  está escrita, documentada e **nunca é chamada**: o renderer pede `audio: true`
  e recebe cancelamento de eco, supressão de ruído e AGC — os filtros de voz que
  a decisão D3 existe para evitar. Cancelamento de eco sobre um loopback da
  própria saída remove justamente o sinal capturado.
- **Restaurar a resolução da transmissão.** A captura entrega Full HD e a
  publicação estrangula para metade. As camadas de simulcast descritas em
  `screenShareLayers()` não chegam ao SDK: só o `maxBitrate` da primeira é
  usado.
- **Fazer o roteiro de dois participantes ouvir.** Ele aprovou dez cenários sem
  jamais verificar áudio, e foi essa aprovação que sustentou a afirmação — falsa
  — de que o som estava validado.
- **Corrigir o que o repositório afirma.** README, `design.md` D11, as notas da
  release 0.4.0 e a tarefa 10.3 do bootstrap descrevem como validado um caminho
  que nunca foi exercido de ponta a ponta.

## Capabilities

### New Capabilities

Nenhuma. O comportamento em falta já estava no escopo do projeto; o que faltava
era o requisito explícito.

### Modified Capabilities

- `voice-session`: a especificação exige publicar a voz e descreve mute,
  push-to-talk e presença, mas **nunca exige que a voz recebida seja audível**.
  É o vão por onde o bug passou: o código satisfaz a spec e o produto não
  funciona. Passa a exigir reprodução e a tratar reprodução bloqueada.
- `screen-sharing`: exige publicar o áudio do sistema "sem processamento de
  voz", sem dizer que a restrição se aplica **no momento da captura** — onde ela
  foi omitida. Passa a exigir também que a resolução entregue acompanhe a
  capturada, em vez de apenas citar "alta qualidade".

## Impact

- `packages/core/src/livekit.ts` — anexar faixas remotas, publicar as camadas de
  simulcast, expor o estado da reprodução
- `packages/core/src/client.ts` — a porta `RoomClient` ganha o que for preciso
  para a reprodução e para o diagnóstico de resolução
- `apps/desktop/src/renderer/App.tsx` — passar as restrições do áudio do sistema
  para `getDisplayMedia`
- `packages/ui` — avisar quando a reprodução estiver bloqueada
- `.claude/skills/run-desktop/two-participants.mjs` — verificar áudio, não só
  vídeo
- Documentação: `README.md`, `design.md` (D11), `tasks.md` (10.3) e as notas da
  release publicada
