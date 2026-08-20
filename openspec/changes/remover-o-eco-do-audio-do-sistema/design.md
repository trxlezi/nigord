## Context

Ver `proposal.md` — Why para as medições que sustentam a abordagem.

Restrições do estado atual que moldam o desenho:

- O áudio remoto é reproduzido pelo adaptador, que anexa cada faixa a um
  elemento `<audio>` dentro de `#nigord-audio`. O volume por participante é
  aplicado pelo próprio SDK sobre esses elementos.
- A faixa de áudio do sistema é obtida no renderer e entregue ao adaptador já
  pronta para publicar.
- `packages/core` não pode depender de Electron, mas pode usar APIs de
  navegador — é onde o LiveKit já vive.

## Goals / Non-Goals

**Goals**

- A faixa publicada não contém o que o próprio aplicativo reproduziu
- O áudio do jogo sobrevive intacto
- Falha de alinhamento degrada para "áudio como estava", nunca para áudio
  danificado

**Non-Goals**

- Cancelamento de eco acústico. O caminho aqui é digital; microfone e caixas de
  som não entram nesta história.
- Remover a voz do próprio microfone da captura — ela não passa pela saída de
  áudio, então não está no loopback.
- Resolver o ponteiro do mouse na captura, que não tem caminho hoje (ver
  `proposal.md`).

## Decisions

### D1 — Subtração de atraso fixo, não filtro adaptativo

O que a medição encontrou decide o desenho:

| Medido | Valor | O que implica |
| ------ | ----- | ------------- |
| Ganho no caminho | 1,000 | Não há escala para estimar |
| Cancelamento por subtração | 83,9 dB | O resíduo é ruído numérico |
| Atraso | 282 ms | Precisa ser medido, não assumido |

Um cancelador acústico existe para lidar com sala, microfone e ganho variável —
nada disso está presente. O caminho é: nossa mistura → placa de som → loopback.
Digital de ponta a ponta, sem reamostragem e sem volume aplicado antes da
captura.

Alternativa descartada: NLMS com filtro longo. Cobrir 282 ms a 48 kHz exigiria
~13.500 coeficientes por amostra, algo em torno de centenas de milhões de
operações por segundo em JavaScript — para resolver um problema que uma
subtração resolve, porque o sinal não é filtrado, apenas atrasado.

### D2 — A referência sai de um barramento nosso, alimentado pelos elementos

Cada elemento `<audio>` criado ao assinar uma faixa é ligado ao grafo por
`createMediaElementSource`, e daí a um barramento de mistura que vai à saída.
O que esse barramento soma é exatamente o que a placa de som recebe do
aplicativo — que é o que precisa ser subtraído.

Por que não substituir os elementos por um mixer próprio: o volume por
participante e o mute local já funcionam sobre `element.volume`, e o roteiro
automatizado verifica reprodução olhando esses elementos. Mantê-los preserva
as duas coisas, e o barramento entra como derivação.

Consequência aceita: a saída passa a depender de um `AudioContext`. Ele começa
suspenso quando o sistema exige gesto — o mesmo caso que a interface já trata
com o aviso de áudio bloqueado, então a ação de destravar também o retoma.

### D3 — O atraso é medido, e remedido

282 ms é o valor desta máquina, com este dispositivo. Outra placa, outro buffer,
outro valor. A estimativa é por correlação cruzada entre a referência e a
captura logo após o compartilhamento começar.

Também é reavaliado periodicamente: se o resíduo subir, o alinhamento se perdeu
e vale outra estimativa. Sem isso, uma troca de dispositivo no meio da sessão
transformaria o cancelamento em ruído somado.

### D4 — Falhar para "não mexer", nunca para "mexer errado"

Se a correlação não encontrar um pico claro, ou se a subtração não estiver
reduzindo energia, a faixa publicada é a capturada, sem alteração. O eco é
irritante; o áudio do jogo cancelado por engano é o recurso central do projeto
quebrado.

Este é o mesmo princípio que o provedor de captura já segue ao relatar o que
foi pedido e deixar a verdade para quem lê o fluxo.

### D5 — Sem processamento por amostra: o grafo subtrai sozinho

O plano era um AudioWorklet. Ele não carrega: no aplicativo empacotado, servido
de `file://`, `audioWorklet.addModule` recusa tanto `blob:` quanto `data:` com
"The user aborted a request". Medido nas duas formas antes de mudar de rumo.

O que substituiu é melhor do que o plano original: duas fontes ligadas ao mesmo
nó somam, então inverter uma delas transforma a soma em subtração. Não há
JavaScript por amostra em lugar nenhum — o navegador faz o trabalho em código
nativo.

JavaScript sobrou num único ponto, e por um motivo específico: a medição do
atraso precisa dos dois sinais **contíguos e na mesma linha do tempo**. Isso
exige um `ScriptProcessorNode` alimentado por um `ChannelMerger` (captura num
canal, referência no outro), durante ~1 segundo por tentativa. A primeira
versão lia os dois de analisadores em intervalos e a correlação não achava pico
nenhum: amostras lidas assim não são contíguas.

### D6 — Três surpresas que a medição pegou, e o que cada uma ensinou

Registradas porque nenhuma delas era dedutível do código:

| Observado | Consequência |
| --------- | ------------ |
| `createMediaElementSource` sobre elemento com `srcObject` de MediaStream entrega **silêncio** | A reprodução saiu dos elementos e passou para o grafo (`createMediaStreamSource`), o que de quebra garante o ganho unitário: o que se ouve e o que se subtrai são o mesmo sinal |
| Faixa remota entregue **só** ao Web Audio não flui no Chromium | Cada faixa mantém um elemento `<audio>` mudo como bomba; ele não reproduz nada, só faz o áudio andar |
| Um sinal periódico correlaciona igual em vários atrasos | A mesma cena estimou 0,3 ms e 595 ms em tentativas seguidas. O candidato passou a ter de **provar** que cancela, medindo o resíduo nos dados já coletados |

A terceira é a mais instrutiva: correlação alta não é alinhamento. Com voz — que
é o caso real — a ambiguidade é pequena; com um tom puro, ela é total.

### D7 — O que esta bancada não consegue provar

As duas instâncias de teste tocam na **mesma placa de som**, então o loopback de
quem compartilha contém o áudio das duas — situação que não existe com duas
máquinas. Silenciar uma delas isola parte do caso, mas a verificação honesta do
resultado final continua sendo uma sessão real.

O que está verificado aqui: o grafo se monta, a reprodução acontece pelo
barramento e chega à placa de som (o loopback capta o que o aplicativo toca), a
estimativa roda, e o desligamento seguro funciona. O que falta: o eco sumindo
para uma pessoa de verdade, do outro lado.

## Risks / Trade-offs

- **Efeitos de áudio do Windows (equalizador, som espacial) quebram o ganho
  unitário** → O resíduo denuncia: se a subtração não reduz energia, ela é
  desligada (D4). Vale medir numa segunda máquina antes de confiar.
- **Deriva de relógio entre reprodução e captura** → São o mesmo dispositivo, e
  a medição não mostrou deriva em um segundo. A reavaliação periódica cobre o
  resto.
- **O `AudioContext` vira dependência da reprodução** → Já havia o caso de
  reprodução bloqueada, com aviso e ação; o retomar entra no mesmo lugar.
- **Mais uma peça no caminho do áudio que a sala escuta** → Por isso o
  desligamento seguro é requisito de especificação, e não detalhe de
  implementação.
