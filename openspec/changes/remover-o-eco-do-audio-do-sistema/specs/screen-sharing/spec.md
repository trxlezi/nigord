## ADDED Requirements

### Requirement: O áudio do sistema não devolve o áudio da própria sala

A faixa de áudio do sistema publicada NÃO SHALL conter o áudio que o próprio
aplicativo reproduziu — as vozes dos demais participantes e o áudio de sistema
recebido de outras transmissões.

Sem isso, quem assiste escuta a própria voz de volta, com o atraso de ida e
volta. O loopback captura a mistura inteira da saída de áudio, e o aplicativo é
uma das fontes dessa mistura.

#### Scenario: Alguém fala enquanto outro compartilha

- **WHEN** um participante fala e outro está compartilhando a tela com áudio do
  sistema
- **THEN** a voz dele não retorna dentro da faixa de áudio do sistema publicada

#### Scenario: Som do jogo preservado

- **WHEN** o áudio da própria sala é removido da faixa publicada
- **THEN** o áudio produzido por outros aplicativos da máquina — o jogo —
  continua audível, sem atenuação perceptível

#### Scenario: Remoção não confiável

- **WHEN** o sistema não consegue alinhar o que reproduziu com o que capturou
- **THEN** o áudio do sistema é publicado sem alteração, e a falha fica
  registrada para diagnóstico, em vez de publicar um áudio danificado
