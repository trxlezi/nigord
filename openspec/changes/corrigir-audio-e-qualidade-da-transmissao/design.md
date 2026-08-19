## Context

Ver `proposal.md` — Why para a motivação e as medições.

O que o desenho precisa levar em conta do estado atual:

- `packages/core/src/livekit.ts` é o único arquivo que conhece o LiveKit
  (bootstrap D1). Tudo acima depende da porta `RoomClient`. Reproduzir áudio é
  manipular elementos de mídia — o lado do navegador —, então há uma decisão real
  sobre de que lado da porta isso mora.
- A prévia local existe e é assistida pelo próprio emissor. Qualquer reprodução
  automática de áudio precisa excluí-la, sob pena de realimentação.
- `packages/ui` não pode importar Electron nem APIs de Node; a regra de lint
  impede.

## Goals / Non-Goals

**Goals**

- Áudio remoto audível, com volume e mute local funcionando sobre o que
  realmente toca
- Restrições de captura do áudio do sistema aplicadas onde a plataforma as lê
- Resolução entregue proporcional à capturada, com queda apenas por restrição
  real
- Verificação automatizada capaz de reprovar uma sala muda

**Non-Goals**

- Mixagem, equalização ou qualquer processamento próprio de áudio
- Seleção de dispositivo de saída por participante (hoje é global e continua)
- Calibração final de bitrate para seis pessoas — continua sendo a tarefa 10.5
  do bootstrap, que depende de sessão real

## Decisions

### D1 — A reprodução mora no adaptador, não na interface

O `livekit-client` cria o elemento e chama `play()` em `track.attach()`. Duas
alternativas:

| Opção                                                        | Consequência                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A interface renderiza um `<audio>` por participante           | React passa a reconciliar elementos de mídia; cada faixa nova é um `useEffect`; a porta `RoomClient` teria de expor faixas, não apenas fluxos       |
| **O adaptador anexa quando a faixa é assinada** ← escolhida   | Os elementos têm o ciclo de vida da faixa, não o de um componente; a interface segue recebendo eventos, e a porta não ganha conceitos               |

A segunda mantém a fronteira que o bootstrap D1 estabeleceu: quem conhece a
biblioteca de mídia é o adaptador. `setVolume` já opera sobre os elementos
anexados, então volume e mute local passam a funcionar sem código novo.

Os elementos ficam num contêiner conhecido (`#nigord-audio`) dentro do
documento, e não soltos: um elemento desanexado toca, mas nada fora do
adaptador consegue observar que ele está tocando — e "o áudio saiu?" é
exatamente a pergunta que ficou sem resposta durante uma sessão inteira.

O vídeo continua como está — a interface o anexa a um `<video>` que ela
posiciona. Vídeo tem lugar na tela; áudio só precisa ser audível e
inspecionável.

### D2 — Prévia local nunca reproduz

Não é preciso código para isso: o SFU nunca assina ninguém às próprias faixas,
e o anexo acontece na assinatura. A realimentação é impossível por construção,
e não por uma verificação que alguém possa esquecer de manter.

### D3 — Reprodução bloqueada é estado observável, não exceção

`Room` emite mudança no estado de reprodução e expõe se ela é permitida. O
adaptador traduz isso para um evento da porta, a interface mostra o aviso, e a
ação do participante chama o que o SDK oferece para iniciar o áudio.

Alternativa descartada: tentar `play()` em silêncio e ignorar a recusa. É
exatamente o comportamento atual — silêncio sem explicação — e foi ele que
custou uma sessão inteira de diagnóstico.

### D4 — As restrições do áudio do sistema vão para a chamada de captura

`systemAudioConstraints()` existe e nunca foi chamada. A correção é passá-la
como restrição da faixa de áudio na requisição de captura, em vez do booleano
atual.

Medido antes da correção, na máquina Windows do autor: a faixa vinha com
`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true` e
`channelCount: 1` — todos os filtros de voz ligados e mono, exatamente o que D3
existe para impedir.

Há uma limitação conhecida da plataforma: o loopback do Windows nem sempre honra
todas as restrições pedidas. Por isso o resultado **é verificado depois de
aberta a faixa** — as configurações efetivas dizem a verdade, e discordância
entre pedido e entrega é informação de diagnóstico, não algo a ignorar em
silêncio. O projeto já tem essa postura: o provedor de captura relata o que foi
pedido e deixa a verdade para quem lê o fluxo.

### D5 — `screenShareEncoding`, e não `videoEncoding`

A causa foi medida, e é mais simples e pior do que as hipóteses: **o campo
tinha o nome errado.**

Para uma track de tela o `livekit-client` lê `screenShareEncoding`; o
`videoEncoding` que a publicação preenchia é o campo da câmera, e para esta
fonte ele é ignorado. Nenhum erro, nenhum aviso — a chave existe e é válida,
só não é a que vale aqui. Consequência: tudo o que `media.ts` descrevia era
decorativo, e o que subia eram os padrões do SDK.

Camadas realmente publicadas, lidas de `getParameters().encodings`:

| Antes (padrões do LiveKit) | Depois (o que media.ts sempre disse) |
| -------------------------- | ------------------------------------ |
| `h` 1920×1080, 2,5 Mbps, **15 fps** | `h` 1920×1080, 5 Mbps, **60 fps** |
| `q` 960×540, 1,5 Mbps, 15 fps       | `q` 960×540, 1,5 Mbps, 30 fps     |

Quinze quadros por segundo num jogo é a descrição técnica de "ficou muito feio".

As camadas inferiores também passam a ser informadas explicitamente
(`screenShareSimulcastLayers`), de modo que o `scaleDownBy` de `media.ts` deixe
de ser decorativo, e a preferência de degradação passa a ser
`maintain-resolution`: sob pressão, esta aplicação prefere perder quadros a
perder pixels.

**O que continua em aberto, e por quê.** Com a correção aplicada, o espectador
do arcabouço de teste ainda recebe 960×540 — mas ali as duas instâncias
disputam o mesmo enlace doméstico, subindo e descendo quatro fluxos, e escolher
a camada baixa é o comportamento correto de um SFU nessas condições. A camada
plena existe e está ativa; qual delas chega depende da rede de quem assiste, o
que só o anel 3 responde. Por isso o teste automatizado afirma o que se publica
e apenas registra o que chega.

### D6 — O roteiro de dois participantes passa a ouvir

A verificação não pode depender de escuta humana. O sinal observável é a
reprodução ativa no receptor: elementos em `#nigord-audio` que não estão
pausados e já têm dados. Para a resolução, o sinal é a camada publicada, não a
recebida — a segunda depende da rede e reprovaria o enlace em vez do código.

O ponto cego que se corrige aqui não é a falta de uma asserção: é ter medido o
que era fácil medir. `videoWidth > 0` aprovou 540p e aprovaria 240p.

## Risks / Trade-offs

- **O contêiner de áudio é DOM criado fora do React** → Fica num nó com id
  próprio, fora da árvore da aplicação, e é limpo quando a faixa termina; o
  risco real seria a interface tentar governá-lo, que é o que D1 evita.
- **A restrição de captura pode não ser honrada pelo loopback do Windows** →
  Verificar as configurações efetivas e reportar divergência, em vez de assumir
  sucesso (D4).
- **Elevar a resolução aumenta o consumo de banda contra a franquia gratuita** →
  A calibração com seis pessoas continua sendo tarefa do bootstrap; esta mudança
  restaura a capacidade e não fixa valores finais.
- **Uma sessão real ainda é necessária para confirmar** → As correções são
  verificáveis em duas instâncias, mas o veredito final é o mesmo de sempre: o
  anel 3.

## Migration Plan

Sem migração de dados nem de configuração. A correção viaja como uma release
nova; quem estiver na 0.4.0 recebe pela atualização automática. Reversão é
republicar a release anterior — que é a versão sem som, então a reversão só faz
sentido se a correção quebrar algo mais grave que o silêncio.

Os textos do repositório que hoje afirmam validação indevida são corrigidos na
mesma mudança, incluindo as notas da release já publicada.
