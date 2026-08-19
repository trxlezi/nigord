## 1. Spike de viabilidade (máquina Windows, antes de tudo)

- [x] 1.1 Criar um Electron mínimo e descartável na máquina Windows que capture tela + áudio do sistema via `setDisplayMediaRequestHandler` com loopback, e reproduza o áudio localmente
- [x] 1.2 Confirmar que a track de áudio do sistema chega separada da track de microfone e que a qualidade do áudio do jogo é aceitável sem processamento de voz
- [x] 1.3 Registrar um atalho global e verificar se ele é recebido com um jogo em fullscreen exclusivo em foco
- [x] 1.4 Registrar o resultado dos três testes em `design.md`; se 1.1 ou 1.2 falharem, interromper e revisar a abordagem antes de prosseguir

## 2. Fundação do monorepo

- [x] 2.1 Inicializar pnpm workspaces com `apps/desktop`, `apps/token-server`, `packages/core`, `packages/shared`, `packages/ui`
- [x] 2.2 Configurar TypeScript em modo estrito com project references entre os workspaces
- [x] 2.3 Configurar ESLint e Prettier, com regra que proíbe importar Electron em `packages/core`, `packages/shared` e `packages/ui`
- [x] 2.4 Configurar Vitest em `packages/core` e `apps/token-server`
- [x] 2.5 Adicionar `.env.example` e carregamento de configuração validado por schema, sem segredos versionados

## 3. Token server

- [x] 3.1 Criar o serviço Fastify com validação de configuração no boot que falha se as chaves do LiveKit estiverem ausentes
- [x] 3.2 Implementar `POST /token` recebendo sala, identidade e segredo compartilhado, retornando JWT de curta duração e a URL do serviço de mídia
- [x] 3.3 Rejeitar solicitações sem o segredo compartilhado ou com campos ausentes/inválidos, com erros distinguíveis
- [x] 3.4 Adicionar limite de taxa por origem
- [x] 3.5 Escrever testes cobrindo os cenários de `specs/room-access` (solicitação válida, campos ausentes, segredo incorreto, excesso de requisições)
- [x] 3.6 Definir os tipos de requisição e resposta em `packages/shared` e consumi-los nas duas pontas

## 4. Núcleo de sessão (`packages/core`)

- [x] 4.1 Modelar a máquina de estados da sessão: desconectado, conectando, conectado, reconectando, encerrado
- [x] 4.2 Implementar entrar e sair de sala sobre o cliente LiveKit, publicando a track de microfone na entrada
- [x] 4.3 Implementar o modelo de participantes: presença, estado de mute, indicação de fala
- [x] 4.4 Implementar mute e unmute do microfone com propagação do estado à sala
- [x] 4.5 Implementar reconexão automática com republicação das tracks ativas e encerramento após falha persistente
- [x] 4.6 Implementar publicação de tela com content hint (movimento vs. texto) e simulcast
- [x] 4.7 Implementar publicação da track de áudio do sistema separada, sem cancelamento de eco, supressão de ruído ou AGC
- [x] 4.8 Implementar assinatura de tracks remotas e controle de volume independente por track e por participante
- [x] 4.9 Escrever testes de unidade da máquina de estados e do modelo de participantes com o cliente LiveKit dublado

## 5. Fronteira de plataforma (`apps/desktop/main`)

- [x] 5.1 Definir a interface `CaptureProvider`: listar fontes, iniciar captura com ou sem áudio do sistema, declarar capacidades disponíveis
- [x] 5.2 Definir a interface `HotkeyProvider`: registrar, liberar e reportar conflito
- [x] 5.3 Implementar as versões Windows de ambas, conforme validado no spike
- [x] 5.4 Implementar os stubs de desenvolvimento que declaram indisponibilidade explícita, sem simular sucesso
- [x] 5.5 Resolver a implementação em um único ponto na inicialização, conforme a plataforma

## 6. Invólucro Electron

- [x] 6.1 Configurar a janela principal com `contextIsolation`, `sandbox` e sem `nodeIntegration`
- [x] 6.2 Implementar o preload expondo uma superfície mínima e nomeada, sem `ipcRenderer` cru
- [x] 6.3 Implementar os canais IPC com payloads validados por schema Zod compartilhado nos dois sentidos
- [x] 6.4 Implementar bandeja do sistema: fechar a janela oculta e mantém a sessão, restaurar pela bandeja, sair encerra a sessão de forma limpa
- [x] 6.5 Implementar instância única, trazendo a instância existente para frente
- [x] 6.6 Abrir links externos no navegador padrão em vez de dentro da janela
- [x] 6.7 Implementar persistência de preferências com fallback para os padrões quando o arquivo estiver ausente ou corrompido
- [x] 6.8 Liberar todos os atalhos globais no encerramento

## 7. Interface

- [x] 7.1 Tela de entrada: escolha de identidade e sala, com estados de erro distinguindo credencial inválida de falha de rede
- [x] 7.2 Lista de participantes com indicação de fala, estado de mute e sinalização de quem está compartilhando
- [x] 7.3 Controles de sessão: mute, sair, alternar push-to-talk
- [x] 7.4 Seletor de fonte de compartilhamento com pré-visualização, opção de áudio do sistema e escolha do tipo de conteúdo
- [x] 7.5 Visualizador de transmissão com modo ampliado e reduzido, e escolha entre transmissões simultâneas
- [x] 7.6 Painel de volumes: áudio do sistema por transmissão e voz por participante, com silenciamento local
- [x] 7.7 Preferências: dispositivos de entrada e saída, tecla de push-to-talk, com reação à troca de dispositivo durante a sessão
- [x] 7.8 Indicador de estado da conexão, incluindo reconexão em andamento

## 8. Push-to-talk

- [x] 8.1 Integrar o `HotkeyProvider` ao controle de microfone do core
- [x] 8.2 Implementar a captura de nova tecla na interface, liberando a anterior e persistindo a escolha
- [x] 8.3 Tratar o conflito de atalho informando o participante e mantendo a configuração anterior

## 9. Build, release e distribuição

- [x] 9.1 Configurar electron-builder para instalador Windows
- [x] 9.2 Criar o workflow do GitHub Actions em `windows-latest` que builda e publica em Releases por tag
- [x] 9.3 Criar o workflow de verificação em pull request: lint, typecheck e testes
- [x] 9.4 Integrar `electron-updater`: verificar ao iniciar, baixar em segundo plano, oferecer reinício, prosseguir normalmente se a verificação falhar
- [x] 9.5 Implantar o token server e apontar o cliente para ele
- [x] 9.6 Documentar no README a instalação, o aviso do SmartScreen e como reportar problemas

## 10. Validação com o grupo

- [ ] 10.1 Percorrer manualmente os cenários de `specs/voice-session` e `specs/screen-sharing` na máquina Windows
- [ ] 10.2 Distribuir a primeira release aos amigos e realizar uma sessão com os seis conectados
- [ ] 10.3 Verificar que o áudio do sistema chega audível e com volume independente da voz, na percepção dos participantes
- [ ] 10.4 Verificar que todos conseguem conectar em suas redes reais, e investigar qualquer falha de travessia de NAT
- [ ] 10.5 Calibrar bitrate e resolução máximos com base na sessão real e registrar os valores em `design.md`
- [ ] 10.6 Medir o consumo de banda contra os limites do plano gratuito do LiveKit Cloud
