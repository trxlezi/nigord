## ADDED Requirements

### Requirement: Qualidade escolhida por quem transmite

O sistema SHALL permitir que quem inicia um compartilhamento escolha a
resolução, a taxa de quadros e o teto de bitrate da transmissão, e SHALL
entregar essa mesma qualidade a todos os espectadores.

A alternativa — cada espectador receber uma versão diferente conforme sua rede
e o tamanho da janela — foi exercida e reprovada em uso real: com 1920×1080
publicado, o espectador recebia 960×540 sem que nada indicasse a perda nem
oferecesse controle sobre ela.

#### Scenario: Escolha antes de compartilhar

- **WHEN** o participante seleciona a fonte e define resolução, taxa de quadros
  e bitrate
- **THEN** o sistema captura e publica com os valores escolhidos, e os
  espectadores recebem essa qualidade

#### Scenario: Ajuste durante a transmissão

- **WHEN** quem está compartilhando altera qualquer um dos três parâmetros
- **THEN** o sistema aplica a mudança sem interromper a transmissão em curso

#### Scenario: Escolha lembrada

- **WHEN** o participante inicia um novo compartilhamento
- **THEN** o sistema oferece os valores usados da última vez

#### Scenario: Espectador sem banda para a qualidade escolhida

- **WHEN** a rede de um espectador não sustenta a transmissão
- **THEN** a experiência dele degrada — a imagem trava ou atrasa — sem que os
  demais espectadores sejam afetados e sem que a qualidade publicada mude

### Requirement: Resolução pedida na captura

O sistema SHALL informar a resolução desejada ao solicitar a captura de tela, e
NÃO SHALL depender do padrão da plataforma.

Pedir apenas a taxa de quadros deixa a resolução a critério do sistema
operacional, o que torna o resto da configuração inútil: nenhum codificador
recupera pixels que a captura não produziu.

#### Scenario: Captura iniciada

- **WHEN** um compartilhamento começa com uma resolução escolhida
- **THEN** a solicitação de captura declara largura, altura e taxa de quadros

#### Scenario: Fonte menor que a resolução pedida

- **WHEN** a janela ou tela capturada é menor do que a resolução escolhida
- **THEN** o sistema captura no tamanho disponível, sem falhar o
  compartilhamento
