## Why

Na primeira sessão em que o áudio do sistema funcionou, apareceu o defeito que
ele carregava desde sempre: **quem assiste escuta a própria voz de volta**. O
loopback do Windows captura a mistura inteira da placa de som de quem
compartilha — inclusive o Nigord dele reproduzindo as vozes da sala.

```
        vozes da sala                    o que o loopback captura
              │                                    │
              ▼                                    ▼
      Nigord do amigo ──▶ saída de áudio ──▶ jogo + VOZES DE TODOS
              ▲                 ▲                  │
              │                 │                  ▼
         Valorant ──────────────┘            publicado de volta
                                             para a sala inteira
```

Não é captação pelo microfone: é digital, então fone de ouvido não resolve.

O caminho óbvio foi medido e descartado: ligar o cancelamento de eco na faixa
do sistema não remove o que o próprio aplicativo tocou — o tom de teste ficou em
−30,0 dB com o cancelador ligado e −29,5 dB com ele desligado, meio decibel de
diferença.

O que a medição encontrou foi melhor. O caminho é inteiramente digital, então o
que o aplicativo toca volta pelo loopback **idêntico**, apenas atrasado:

| Medição | Valor |
| ------- | ----- |
| Atraso entre reproduzir e capturar | 282 ms |
| Ganho aplicado no caminho | 1,000 |
| Cancelamento por subtração simples | **83,9 dB** |

Com ganho unitário e sinal idêntico, subtrair o que nós mesmos tocamos remove o
eco por completo. Não é um cancelador acústico adaptativo — é aritmética sobre
um sinal que já temos.

## What Changes

- **O áudio que o aplicativo reproduz passa a ser somado num barramento
  próprio**, de onde sai a referência exata do que foi para a placa de som.
- **A faixa de áudio do sistema publicada passa a ser a capturada menos essa
  referência**, alinhada pelo atraso medido.
- **O atraso é estimado por correlação** ao iniciar o compartilhamento e
  reavaliado periodicamente, porque ele pode mudar entre máquinas e sessões.
- **Se a subtração não estiver cancelando**, o sistema mantém o áudio como está
  e relata — silenciar o áudio do jogo por um cancelamento mal alinhado seria
  pior que o eco.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `screen-sharing`: a especificação exige que o áudio do sistema seja publicado
  como faixa separada e sem processamento de voz, mas não diz nada sobre o
  aplicativo capturar a si mesmo. Passa a exigir que a faixa publicada não
  contenha o áudio que o próprio aplicativo reproduziu.

## Impact

- `packages/core/src/audio/` — o barramento de mistura e a subtração
- `packages/core/src/livekit.ts` — publica a faixa limpa em vez da capturada
- `apps/desktop/src/renderer/App.tsx` — entrega a faixa capturada para
  tratamento antes de publicar
- `.claude/skills/run-desktop/two-participants.mjs` — verificação de que o
  próprio áudio não volta

## Fora de escopo, e por quê

**O ponteiro do mouse aparecer na transmissão** foi relatado junto e não tem
correção possível hoje: `cursor: 'never'` é ignorado na captura e
`getCapabilities()` da faixa nem lista `cursor`. É limitação conhecida do
Electron ([#7584](https://github.com/electron/electron/issues/7584),
[#14337](https://github.com/electron/electron/issues/14337),
[#23923](https://github.com/electron/electron/issues/23923)), aberta desde
2016. Sair dela exige um capturador nativo, que é uma mudança de outra ordem.
Fica registrado nos problemas conhecidos em vez de silenciosamente pendente.
