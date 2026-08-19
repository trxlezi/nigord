## ADDED Requirements

### Requirement: Áudio do sistema livre de processamento de voz na captura

O sistema SHALL capturar o áudio do sistema com cancelamento de eco, supressão
de ruído e controle automático de ganho desativados, e em estéreo quando a
origem o oferecer.

A exigência vale no momento da captura, não apenas na publicação: os filtros de
voz são aplicados pela plataforma ao abrir a faixa, e uma faixa já filtrada não
tem como ser recuperada depois. O cancelamento de eco é o mais grave dos três,
porque o sinal que ele usa como referência é o mesmo que está sendo capturado —
ele foi projetado para remover exatamente aquele conteúdo.

#### Scenario: Faixa de áudio do sistema aberta

- **WHEN** o participante inicia um compartilhamento com áudio do sistema
- **THEN** a faixa capturada apresenta cancelamento de eco, supressão de ruído e
  ganho automático desativados

#### Scenario: Voz permanece filtrada

- **WHEN** o mesmo participante tem o microfone publicado
- **THEN** a faixa de voz mantém cancelamento de eco e supressão de ruído
  ativos, sem que a escolha feita para o áudio do sistema a afete

### Requirement: Reprodução do áudio do sistema recebido

O sistema SHALL tornar audível, para cada espectador, o áudio do sistema de uma
transmissão que ele esteja assistindo, de forma independente do volume das
vozes.

#### Scenario: Transmissão com áudio

- **WHEN** um participante compartilha a tela com áudio do sistema
- **THEN** os espectadores escutam esse áudio, e reduzir seu volume não afeta o
  volume das vozes

#### Scenario: Prévia local

- **WHEN** quem compartilha assiste à própria prévia
- **THEN** o sistema não reproduz o áudio do sistema para ele, evitando
  realimentação com a própria saída

### Requirement: Resolução entregue proporcional à capturada

O sistema SHALL entregar aos espectadores a resolução capturada na origem
quando a banda e a área de exibição permitirem, reduzindo-a apenas em resposta a
restrição de rede, de capacidade da máquina ou de tamanho da área onde a
transmissão é exibida.

"Alta qualidade" sem um critério verificável permitiu que uma captura de
1920×1080 fosse entregue a 960×540 sem que nada acusasse a perda.

#### Scenario: Espectador com banda e área suficientes

- **WHEN** um participante compartilha uma tela de 1920×1080 e o espectador a
  exibe numa área compatível, com banda suficiente
- **THEN** o espectador recebe a transmissão em 1920×1080

#### Scenario: Restrição de rede

- **WHEN** a banda disponível de um espectador não sustenta a camada mais alta
- **THEN** o sistema reduz a qualidade apenas para esse espectador, sem alterar
  o que os demais recebem
