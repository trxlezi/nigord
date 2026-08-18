## Purpose

Autorização de entrada em salas para um grupo fechado e conhecido, emitindo credenciais de curta duração que identificam o participante perante o serviço de mídia sem exigir cadastro, senha ou banco de dados.

## ADDED Requirements

### Requirement: Emissão de credencial de acesso

O sistema SHALL expor um endpoint que, dado um nome de sala e uma identidade de participante, emite uma credencial de acesso de curta duração aceita pelo serviço de mídia.

#### Scenario: Solicitação válida

- **WHEN** um cliente autorizado solicita acesso informando sala e identidade válidas
- **THEN** o sistema retorna uma credencial que concede permissão para publicar e receber mídia naquela sala, junto com o endereço do serviço de mídia

#### Scenario: Sala ou identidade ausente

- **WHEN** a solicitação omite o nome da sala ou a identidade
- **THEN** o sistema rejeita a solicitação com erro de validação e não emite credencial

#### Scenario: Identidade já conectada

- **WHEN** a identidade solicitada já está conectada à sala
- **THEN** o sistema emite a credencial e a conexão anterior daquela identidade é encerrada, garantindo uma sessão por identidade

### Requirement: Validade limitada da credencial

Toda credencial emitida SHALL expirar automaticamente após um período curto e SHALL ser válida apenas para a sala e a identidade informadas na solicitação.

#### Scenario: Credencial expirada

- **WHEN** um cliente tenta entrar usando uma credencial cuja validade já passou
- **THEN** o serviço de mídia rejeita a conexão

#### Scenario: Credencial reutilizada em outra sala

- **WHEN** um cliente tenta usar uma credencial emitida para uma sala a fim de entrar em outra
- **THEN** o serviço de mídia rejeita a conexão

### Requirement: Restrição de acesso ao grupo

O sistema SHALL restringir a emissão de credenciais a solicitantes que apresentem o segredo compartilhado do grupo.

#### Scenario: Solicitante sem o segredo

- **WHEN** a solicitação não apresenta o segredo compartilhado ou apresenta um valor incorreto
- **THEN** o sistema recusa a solicitação e não emite credencial

### Requirement: Proteção das chaves do serviço de mídia

As chaves de API do serviço de mídia SHALL permanecer exclusivamente no serviço emissor e NÃO SHALL ser distribuídas no aplicativo cliente nem versionadas no repositório.

#### Scenario: Inspeção do pacote distribuído

- **WHEN** o executável distribuído aos participantes é inspecionado
- **THEN** nenhuma chave de API do serviço de mídia está presente

#### Scenario: Configuração ausente no serviço

- **WHEN** o serviço emissor é iniciado sem as chaves configuradas
- **THEN** o serviço falha ao iniciar com uma mensagem explícita, em vez de aceitar solicitações e emitir credenciais inválidas

### Requirement: Limite de taxa

O sistema SHALL limitar a frequência de solicitações de credencial por origem.

#### Scenario: Excesso de solicitações

- **WHEN** uma origem excede o limite de solicitações no intervalo definido
- **THEN** o sistema recusa as solicitações excedentes e sinaliza quando novas tentativas serão aceitas
