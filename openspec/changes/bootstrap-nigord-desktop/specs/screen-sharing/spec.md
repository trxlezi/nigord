## Purpose

Compartilhamento de tela ou janela em alta qualidade entre os participantes de uma sala, incluindo o áudio do sistema da máquina que compartilha, com controle independente de volume por quem assiste.

## ADDED Requirements

### Requirement: Selecionar e iniciar o compartilhamento

O sistema SHALL permitir que o participante escolha uma tela inteira ou uma janela específica para compartilhar, apresentando uma pré-visualização de cada opção disponível antes da confirmação.

#### Scenario: Compartilhar uma janela

- **WHEN** o participante escolhe uma janela específica e confirma
- **THEN** o sistema publica o conteúdo dessa janela na sala e indica aos demais que ele está compartilhando

#### Scenario: Compartilhar a tela inteira

- **WHEN** o participante escolhe uma tela inteira e confirma
- **THEN** o sistema publica o conteúdo dessa tela na sala

#### Scenario: Cancelar a seleção

- **WHEN** o participante fecha o seletor sem escolher uma fonte
- **THEN** o sistema não publica nada e mantém a sessão de voz inalterada

#### Scenario: Janela compartilhada é fechada

- **WHEN** a janela que estava sendo compartilhada é fechada pelo sistema operacional
- **THEN** o sistema encerra a publicação da track de vídeo e informa o participante

### Requirement: Encerrar o compartilhamento

O sistema SHALL permitir encerrar o compartilhamento a qualquer momento sem afetar a sessão de voz.

#### Scenario: Encerramento explícito

- **WHEN** o participante aciona o comando de parar o compartilhamento
- **THEN** o sistema encerra as tracks de vídeo e de áudio do sistema, mantém a track de voz publicada e remove o indicador de compartilhamento

### Requirement: Áudio do sistema como track separada

Quando o participante opta por incluir o áudio do sistema, o sistema SHALL capturá-lo e publicá-lo como uma track distinta da track de voz, e esse áudio NÃO SHALL ser submetido ao cancelamento de eco, à supressão de ruído ou ao controle automático de ganho.

#### Scenario: Compartilhar com áudio do sistema

- **WHEN** o participante inicia o compartilhamento com a opção de áudio do sistema ativada
- **THEN** o sistema publica uma track de áudio separada contendo o som reproduzido pela máquina, e os demais participantes a escutam junto com a voz

#### Scenario: Compartilhar sem áudio do sistema

- **WHEN** o participante inicia o compartilhamento com a opção de áudio do sistema desativada
- **THEN** o sistema publica apenas a track de vídeo

#### Scenario: Captura de áudio do sistema indisponível

- **WHEN** a plataforma em execução não oferece captura de áudio do sistema
- **THEN** o sistema apresenta a opção como indisponível com a razão, e o compartilhamento de vídeo prossegue normalmente

### Requirement: Qualidade da transmissão de vídeo

O sistema SHALL declarar ao transporte de mídia a natureza do conteúdo compartilhado, distinguindo conteúdo em movimento de conteúdo estático rico em texto, e SHALL publicar o vídeo em múltiplas qualidades simultâneas para que cada espectador receba a que sua conexão suporta.

#### Scenario: Compartilhamento de conteúdo em movimento

- **WHEN** o participante indica que está compartilhando conteúdo em movimento
- **THEN** o sistema prioriza a fluidez do movimento sobre a nitidez de detalhes estáticos

#### Scenario: Compartilhamento de conteúdo com texto

- **WHEN** o participante indica que está compartilhando conteúdo com texto
- **THEN** o sistema prioriza a nitidez dos detalhes sobre a taxa de quadros

#### Scenario: Espectador com conexão limitada

- **WHEN** um espectador não tem banda suficiente para a qualidade máxima publicada
- **THEN** o sistema entrega a ele uma qualidade menor sem degradar o que os demais espectadores recebem

### Requirement: Assistir ao compartilhamento de outro participante

O sistema SHALL exibir o vídeo compartilhado por outro participante e SHALL permitir alternar entre uma visualização ampliada e uma visualização reduzida.

#### Scenario: Um participante começa a compartilhar

- **WHEN** outro participante inicia um compartilhamento
- **THEN** o sistema sinaliza a disponibilidade da transmissão e permite que o espectador a abra

#### Scenario: Compartilhamentos simultâneos

- **WHEN** mais de um participante está compartilhando ao mesmo tempo
- **THEN** o sistema lista todas as transmissões disponíveis e permite ao espectador escolher qual assistir

#### Scenario: Quem compartilha encerra a transmissão

- **WHEN** o participante que compartilhava encerra a transmissão
- **THEN** o sistema fecha a visualização nos espectadores e informa que a transmissão terminou

### Requirement: Controle independente de volume por espectador

O sistema SHALL permitir que cada espectador ajuste, de forma independente, o volume do áudio do sistema de uma transmissão e o volume da voz de cada participante.

#### Scenario: Reduzir o áudio do jogo mantendo a voz

- **WHEN** o espectador reduz o volume do áudio do sistema de uma transmissão
- **THEN** o sistema aplica a redução apenas àquela track e mantém inalterado o volume das vozes

#### Scenario: Silenciar um participante localmente

- **WHEN** o espectador silencia um participante específico
- **THEN** o sistema deixa de reproduzir o áudio daquele participante apenas para esse espectador, sem afetar os demais
