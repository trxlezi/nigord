## Context

Ver `proposal.md` — Why para a medição que motiva a mudança.

Três fatos do estado atual que moldam o desenho:

- A publicação usa simulcast com duas camadas, `adaptiveStream` e `dynacast`
  ligados. Os três conspiram para que o espectador receba a camada baixa.
- `contentKindFor` alimenta o `contentHint` da track, que é ortogonal a
  bitrate: diz ao codificador o que a imagem é (movimento vs. texto), não
  quanto ela pode gastar.
- A referência (`group-sharescreen`) é mesh P2P. O que se copia dela é o
  **modelo de controle**, não a topologia — o SFU continua, porque é ele que
  evita um upload por espectador.

## Goals / Non-Goals

**Goals**

- Uma qualidade só na sala, definida por quem transmite
- Controles explícitos, com os valores visíveis a quem escolhe
- Mudança em transmissão, sem reiniciar o compartilhamento

**Non-Goals**

- Estrangulamento automático por número de pessoas. A referência tem
  `THROTTLE_START_PEERS` e `RESOLUTION_STEP_DOWN_PEERS` porque no mesh cada
  espectador custa um upload inteiro; com SFU quem compartilha sobe um fluxo
  só, quaisquer que sejam os espectadores. Copiar aquilo seria pagar por um
  problema que a topologia já resolveu.
- Qualidade adaptativa por espectador. É exatamente o que se está removendo.
- Escolha de codec.

## Decisions

### D1 — Simulcast desligado no compartilhamento de tela

É a decisão central, e é um trade-off assumido, não um detalhe.

| | Simulcast (hoje) | Codificação única (decidido) |
| --- | --- | --- |
| Quem decide | Espectador e rede | Quem transmite |
| Rede fraca | Vê versão menor | Vê travando |
| Previsibilidade | Nenhuma para quem mostra | Total |
| Custo de upload | Soma das camadas | Só a camada escolhida |

Com seis amigos conhecidos, previsibilidade vale mais do que degradação
graciosa: quem mostra a tela precisa saber o que os outros estão vendo. É
também o que a referência faz, e o motivo de lá "ter 1080p60" e funcionar.

Um efeito colateral positivo: sem as camadas inferiores, o upload de quem
transmite cai para o bitrate escolhido, em vez da soma das camadas.

`adaptiveStream` continua ligado — sem camadas para escolher, ele deixa de
poder reduzir a qualidade, e o que sobra dele é útil: pausar o vídeo quando o
elemento não está visível.

### D2 — Três dials, não um preset único

Resolução, taxa de quadros e bitrate são escolhidos separadamente, como na
referência. Um preset único ("alta/média/baixa") esconderia justamente a
escolha que o caso de uso exige: 1080p a 30 quadros e 1080p a 60 quadros
servem a coisas diferentes, e quem está mostrando o jogo sabe qual quer.

Valores adotados da referência, que são razoáveis e já foram exercidos em
produção por ela:

- Resolução: 1080p, 720p, 480p, 360p
- Quadros: 15, 24, 30, 60
- Bitrate: ~700 kbps, ~2 Mbps, ~4 Mbps

Diferença deliberada: a referência trata 4 Mbps como teto porque no mesh esse
número é multiplicado por espectador. Aqui ele não é, então cabe um degrau
acima para quem tem upload — mas isso fica para depois de uma sessão real
medir o consumo contra a franquia do plano gratuito (bootstrap 10.6), e não se
inventa agora.

### D3 — O tipo de conteúdo permanece

`motion`/`detail` não é redundante com os dials. Ele define o `contentHint`,
que diz ao codificador **o que a imagem é** — se deve preservar movimento ou
nitidez ao gastar o bitrate que tem. Os dials dizem **quanto** ele pode gastar.
Remover o tipo de conteúdo por parecer redundante degradaria texto e jogo ao
mesmo tempo.

### D4 — Mudança em transmissão via `applyConstraints` e parâmetros do emissor

Copiado da referência: a resolução e a taxa de quadros vão para a track viva
com `applyConstraints`; o bitrate vai para o emissor via os parâmetros do RTP.
Nenhum dos dois exige republicar a track, e republicar custaria um piscar na
tela de todos os espectadores.

Se a plataforma recusar a nova restrição, a transmissão continua com a
anterior — degradar para "não mudou" é melhor do que derrubar o
compartilhamento no meio.

### D5 — A verificação automatizada muda de forma junto

O roteiro de dois participantes afirma hoje que existe "uma camada em resolução
plena", o que só faz sentido com simulcast. Passa a afirmar que existe **uma**
codificação e que ela corresponde ao que foi escolhido. A resolução recebida
continua registrada e não afirmada — com as duas instâncias no mesmo enlace,
afirmar entrega é afirmar a rede.

### D6 — Resultado medido

Na mesma bancada onde a versão com simulcast entregava 960×540 a partir de uma
captura de 1920×1080:

| | Antes (simulcast) | Depois (codificação única) |
| --- | --- | --- |
| Codificações publicadas | 2 | 1 |
| Recebido pelo espectador | 960×540 | **1920×1080** |
| Teto/quadros publicados | 5 Mbps / 60 fps na camada alta | 4 Mbps / 60 fps |

Isso responde a pergunta que ficou aberta na mudança anterior — a entrega em
540p **não** era limitação de banda do enlace de teste, era a escolha por
espectador. Removida a escolha, a resolução plena atravessa no mesmo enlace.

Mudança em transmissão, medida no mesmo teste: passar de 1080p/4 Mbps para
720p/700 kbps alterou a captura para 1280×720 e chegou ao espectador em
1280×720, sem interromper o compartilhamento.

### D7 — Captura de janela não devolve o tamanho da janela

Medido no Windows: compartilhando uma janela de **1100×720**, a faixa capturada
reporta **1920×1080** com `resizeMode: "crop-and-scale"`. O mesmo acontece
pedindo só a taxa de quadros, que era o comportamento anterior, e pedindo `max`
em vez de `ideal` — ou seja, **não é consequência desta mudança**: é como o
Electron entrega captura de janela nesta plataforma.

A consequência prática é real: compartilhar uma janela pequena a 1080p gasta
bitrate codificando pixels que a janela não tem. Quem compartilha tem, agora,
como responder — baixar a resolução no próprio controle, sem parar.

O cenário da spec foi corrigido para descrever o observado em vez do esperado.
Registrar a diferença vale mais do que uma afirmação bonita e falsa: foi
exatamente esse tipo de afirmação que sustentou uma release inteira sem som.

## Risks / Trade-offs

- **Quem tem internet ruim para de ver a tela** → É a decisão, tomada de olhos
  abertos. A mitigação está nas mãos de quem transmite: baixar a resolução
  ajuda a sala inteira, e agora isso é possível sem parar a transmissão.
- **1080p60 a 4 Mbps consome a franquia do plano gratuito mais rápido** →
  Medir na primeira sessão real (bootstrap 10.6); os valores são dados e não
  código, e mudá-los é uma linha.
- **A captura pode não honrar a resolução pedida** → `ideal`, nunca `exact`:
  uma janela pequena captura no tamanho que tem em vez de falhar.
- **Sem camada baixa, um espectador ruim pode arrastar o emissor** → Com SFU,
  não: o emissor manda um fluxo para o servidor, e o problema do espectador
  fica entre ele e o servidor.

## Migration Plan

Sem migração de dados: as preferências novas têm padrão, e um arquivo antigo
carrega os padrões. Distribuição pela release seguinte, como sempre.
