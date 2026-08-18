## Purpose

Comunicação por voz contínua entre os participantes de uma sala, com controle de microfone por mute e por push-to-talk, e visibilidade de quem está presente e quem está falando.

## ADDED Requirements

### Requirement: Entrar em uma sala

O sistema SHALL permitir que um participante identificado entre em uma sala nomeada e comece a transmitir e receber áudio imediatamente após a conexão ser estabelecida.

#### Scenario: Entrada bem-sucedida

- **WHEN** o participante escolhe uma sala e confirma a entrada com um token válido
- **THEN** o sistema conecta à sala, publica a track de áudio do microfone e apresenta a lista dos participantes já presentes

#### Scenario: Token inválido ou expirado

- **WHEN** a tentativa de entrada usa um token rejeitado pelo serviço de mídia
- **THEN** o sistema não conecta e apresenta uma mensagem de erro distinguindo credencial inválida de falha de rede

#### Scenario: Sala vazia

- **WHEN** o participante entra em uma sala sem nenhum outro participante
- **THEN** o sistema conecta normalmente e indica que ele está sozinho na sala

### Requirement: Sair de uma sala

O sistema SHALL permitir que o participante saia da sala, encerrando a publicação de todas as suas tracks, e SHALL notificar os demais participantes de sua saída.

#### Scenario: Saída explícita

- **WHEN** o participante aciona o comando de sair
- **THEN** o sistema encerra todas as tracks publicadas, desconecta da sala e remove o participante da lista exibida aos demais

#### Scenario: Encerramento do aplicativo durante a sessão

- **WHEN** o aplicativo é fechado enquanto o participante está conectado
- **THEN** o sistema encerra a conexão de forma limpa antes de terminar o processo

### Requirement: Controle de microfone por mute

O sistema SHALL permitir silenciar e reativar o microfone local, e o estado de mute SHALL ser visível para todos os participantes da sala.

#### Scenario: Silenciar o microfone

- **WHEN** o participante aciona o mute
- **THEN** o sistema para de transmitir áudio do microfone e exibe o participante como silenciado para todos na sala

#### Scenario: Reativar o microfone

- **WHEN** o participante desfaz o mute
- **THEN** o sistema volta a transmitir áudio e atualiza o indicador para todos na sala

#### Scenario: Estado de mute persiste entre sessões

- **WHEN** o participante entra na sala após ter saído com o microfone silenciado
- **THEN** o sistema restaura o estado silenciado

### Requirement: Push-to-talk global

O sistema SHALL oferecer um modo push-to-talk no qual o microfone transmite apenas enquanto uma tecla configurada está pressionada, e essa tecla SHALL ser reconhecida mesmo quando o aplicativo não está em foco.

#### Scenario: Transmitir enquanto a tecla está pressionada

- **WHEN** o modo push-to-talk está ativo e o participante pressiona e mantém a tecla configurada
- **THEN** o sistema transmite o áudio do microfone enquanto a tecla permanecer pressionada e interrompe a transmissão ao soltá-la

#### Scenario: Aplicativo fora de foco

- **WHEN** o modo push-to-talk está ativo, outra aplicação está em foco e o participante pressiona a tecla configurada
- **THEN** o sistema transmite o áudio normalmente

#### Scenario: Reconfigurar a tecla

- **WHEN** o participante define uma nova tecla para push-to-talk
- **THEN** o sistema passa a reconhecer a nova tecla, libera a anterior e persiste a escolha entre execuções

#### Scenario: Tecla indisponível

- **WHEN** a tecla escolhida não pode ser registrada como atalho global
- **THEN** o sistema informa o participante e mantém a configuração anterior

### Requirement: Presença e indicação de fala

O sistema SHALL exibir a lista de participantes conectados à sala e SHALL indicar visualmente quais deles estão falando no momento.

#### Scenario: Participante entra na sala

- **WHEN** outro participante entra na sala
- **THEN** o sistema o adiciona à lista exibida em até dois segundos

#### Scenario: Participante começa a falar

- **WHEN** o áudio de um participante ultrapassa o limiar de detecção de fala
- **THEN** o sistema destaca esse participante na lista enquanto ele estiver falando

#### Scenario: Participante perde a conexão

- **WHEN** um participante desconecta inesperadamente
- **THEN** o sistema o remove da lista exibida aos demais

### Requirement: Qualidade e processamento do áudio de voz

O sistema SHALL aplicar cancelamento de eco, supressão de ruído e controle automático de ganho à track do microfone.

#### Scenario: Áudio dos alto-falantes não retorna

- **WHEN** o participante usa alto-falantes e outro participante está falando
- **THEN** o sistema não retransmite o áudio recebido de volta para a sala

### Requirement: Resiliência de conexão

O sistema SHALL detectar a perda de conexão com o serviço de mídia e SHALL tentar reconectar automaticamente, informando o participante sobre o estado da conexão.

#### Scenario: Queda temporária de rede

- **WHEN** a conexão com o serviço de mídia cai por um período curto
- **THEN** o sistema indica o estado de reconexão e restabelece a sessão automaticamente, republicando as tracks que estavam ativas

#### Scenario: Falha persistente

- **WHEN** as tentativas de reconexão falham repetidamente
- **THEN** o sistema encerra a sessão, informa o participante e oferece a opção de tentar entrar novamente
