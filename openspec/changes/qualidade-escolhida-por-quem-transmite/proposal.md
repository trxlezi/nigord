## Why

A 0.5.0 corrigiu o campo errado na publicação — a camada de topo passou de 15
para 60 quadros por segundo — e **a imagem continuou ruim na sessão real**. A
correção era necessária e não foi suficiente, porque o que sobrou é uma decisão
de arquitetura, não um defeito:

```
hoje                                    decidido
────                                    ────────
publica duas camadas (simulcast)        publica uma camada
quem assiste escolhe qual recebe        quem transmite escolhe qual todos veem
        │                                       │
        └─ e escolhe a baixa: por tamanho       └─ e é a mesma para a sala
           de janela, por estimativa de
           banda, por dynacast
```

Medido: com a camada de 1920×1080 publicada e ativa, e o elemento de vídeo em
1888×1016, o espectador continuava recebendo 960×540. Publicar em alta não
significa receber em alta.

O `group-sharescreen` — o projeto que serviu de referência — entrega 1080p60 de
forma previsível porque é mesh P2P com **uma codificação só**, controlada por
quem compartilha. Esta mudança adota o mesmo modelo de controle, sem adotar a
topologia mesh (que custaria um upload por espectador; ver bootstrap design.md
sobre SFU).

## What Changes

- **BREAKING (comportamento):** o compartilhamento de tela deixa de usar
  simulcast. Passa a existir uma codificação só, e é ela que todos recebem.
  Quem tem rede insuficiente passa a ver travando em vez de ver uma versão
  menor — é a consequência aceita da decisão.
- **Quem compartilha escolhe resolução, taxa de quadros e bitrate**, com
  valores explícitos, no lugar da escolha implícita de hoje entre "jogo" e
  "texto".
- **A captura passa a pedir resolução**, e não só taxa de quadros: hoje
  `getDisplayMedia` recebe apenas `frameRate`, então a resolução é o que a
  plataforma quiser dar.
- **A qualidade pode mudar no meio da transmissão**, sem parar e recomeçar o
  compartilhamento.
- A escolha fica guardada nas preferências, como já acontece com o tipo de
  conteúdo e o áudio do sistema.
- O tipo de conteúdo (`motion`/`detail`) continua existindo — ele informa o
  `contentHint` do codificador, que é outra coisa: diz o que a imagem É, não
  quanta banda ela pode usar.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `screen-sharing`: hoje a especificação fala em "alta qualidade" e deixa a
  entrega ao critério da rede de quem assiste. Passa a exigir que a qualidade
  seja escolhida por quem transmite e igual para todos os espectadores, com os
  parâmetros expostos a quem compartilha.

## Impact

- `packages/core/src/media.ts` — presets de resolução, taxa de quadros e
  bitrate; as camadas de simulcast deixam de existir
- `packages/core/src/livekit.ts` — publicação com codificação única
- `packages/core/src/client.ts` — a porta transporta a qualidade escolhida e
  permite alterá-la em transmissão
- `apps/desktop/src/renderer/App.tsx` — restrições de captura completas
- `packages/ui/src/SourcePicker.tsx` — os controles
- `packages/shared/src/preferences.ts` — persistência da escolha
- `.claude/skills/run-desktop/two-participants.mjs` — a verificação de camadas
  muda de forma junto com o modelo
