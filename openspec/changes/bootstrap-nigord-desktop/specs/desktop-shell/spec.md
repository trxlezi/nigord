## Purpose

O invólucro desktop do aplicativo no Windows: janela e bandeja do sistema, registro de atalhos globais, isolamento de segurança entre o código privilegiado e a interface, e o ciclo de atualização automática que mantém todos os participantes na mesma versão.

## ADDED Requirements

### Requirement: Janela principal e bandeja do sistema

O sistema SHALL manter a sessão ativa quando a janela principal é fechada, permanecendo acessível pela bandeja do sistema, e SHALL só encerrar o processo por um comando explícito de sair.

#### Scenario: Fechar a janela durante uma sessão

- **WHEN** o participante fecha a janela principal enquanto está conectado a uma sala
- **THEN** o sistema oculta a janela, mantém a conexão e o áudio ativos, e exibe o ícone na bandeja

#### Scenario: Restaurar pela bandeja

- **WHEN** o participante aciona o ícone na bandeja
- **THEN** o sistema exibe novamente a janela principal com o estado da sessão preservado

#### Scenario: Sair pelo comando explícito

- **WHEN** o participante aciona o comando de sair
- **THEN** o sistema encerra a sessão de mídia de forma limpa e termina o processo

### Requirement: Instância única

O sistema SHALL impedir que mais de uma instância do aplicativo execute simultaneamente na mesma máquina.

#### Scenario: Segunda execução

- **WHEN** o participante executa o aplicativo enquanto uma instância já está em execução
- **THEN** o sistema traz a instância existente para frente e encerra a nova, sem criar uma segunda sessão

### Requirement: Isolamento entre código privilegiado e interface

A interface SHALL executar sem acesso direto às APIs do sistema operacional, e toda capacidade privilegiada SHALL ser exposta por uma superfície de comunicação explícita e tipada, restrita às operações que o aplicativo realmente usa.

#### Scenario: Interface tenta acesso não exposto

- **WHEN** o código da interface tenta usar uma capacidade do sistema operacional que não foi explicitamente exposta
- **THEN** o acesso falha, pois apenas as operações declaradas estão disponíveis

#### Scenario: Conteúdo externo

- **WHEN** o aplicativo encontra um link para conteúdo externo
- **THEN** o sistema o abre no navegador padrão em vez de carregá-lo dentro da janela do aplicativo

### Requirement: Registro de atalhos globais

O sistema SHALL registrar atalhos de teclado reconhecidos mesmo quando o aplicativo não está em foco, e SHALL liberá-los ao encerrar.

#### Scenario: Conflito com outro aplicativo

- **WHEN** o atalho solicitado já está registrado por outro aplicativo do sistema
- **THEN** o sistema informa que o atalho não pôde ser registrado e mantém a configuração anterior

#### Scenario: Liberação ao encerrar

- **WHEN** o aplicativo é encerrado
- **THEN** o sistema libera todos os atalhos globais que havia registrado

### Requirement: Atualização automática

O sistema SHALL verificar a existência de versões novas ao iniciar, baixá-las em segundo plano e aplicá-las com a confirmação do participante, sem exigir reinstalação manual.

#### Scenario: Nova versão disponível

- **WHEN** o aplicativo inicia e existe uma versão mais recente publicada
- **THEN** o sistema baixa a atualização em segundo plano e oferece ao participante reiniciar para aplicá-la

#### Scenario: Adiar a atualização

- **WHEN** o participante opta por não reiniciar naquele momento
- **THEN** o sistema mantém a versão atual em execução e aplica a atualização no próximo início

#### Scenario: Falha ao verificar atualizações

- **WHEN** a verificação de atualizações falha por indisponibilidade de rede
- **THEN** o sistema registra a falha e prossegue normalmente com a versão instalada

### Requirement: Persistência de preferências locais

O sistema SHALL persistir entre execuções as preferências do participante — identidade, dispositivos de áudio escolhidos, tecla de push-to-talk, estado de mute e volumes por participante.

#### Scenario: Reinício do aplicativo

- **WHEN** o participante reinicia o aplicativo
- **THEN** o sistema restaura as preferências salvas anteriormente

#### Scenario: Preferências corrompidas ou ausentes

- **WHEN** o arquivo de preferências está ausente ou não pode ser interpretado
- **THEN** o sistema inicia com os valores padrão em vez de falhar

### Requirement: Seleção de dispositivos de áudio

O sistema SHALL permitir escolher o dispositivo de entrada e o de saída de áudio entre os disponíveis na máquina, e SHALL reagir a mudanças na lista de dispositivos durante a sessão.

#### Scenario: Trocar de dispositivo durante a sessão

- **WHEN** o participante escolhe outro dispositivo de entrada enquanto está conectado
- **THEN** o sistema passa a capturar pelo novo dispositivo sem exigir que ele saia da sala

#### Scenario: Dispositivo selecionado é desconectado

- **WHEN** o dispositivo em uso é removido da máquina
- **THEN** o sistema passa a usar o dispositivo padrão do sistema operacional e informa o participante
