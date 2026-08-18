## Why

Um grupo fechado de 5-6 amigos precisa de voz e compartilhamento de tela para jogar junto, mas as alternativas prontas ou degradam a qualidade da tela em planos gratuitos ou trazem um peso de comunidade, chat e descoberta que o grupo não usa. O Nigord entrega apenas o núcleo — voz sempre ligada e tela em alta qualidade com o áudio do sistema junto — para um grupo conhecido e pequeno.

## What Changes

- Aplicativo desktop Electron para **Windows** que conecta a uma sala persistente com voz sempre ligada.
- Compartilhamento de tela ou janela em alta qualidade, com o **áudio do sistema capturado como track separada** da voz (o áudio do jogo não passa pelo cancelamento de eco).
- Transporte de mídia via **SFU** (LiveKit Cloud) em vez de mesh P2P: com 6 participantes, o mesh exigiria ~25 Mbps de upload de quem compartilha a tela.
- **Push-to-talk global**, ativo mesmo com o jogo em foco.
- Backend mínimo: um serviço com uma rota que emite tokens JWT de acesso à sala. Sem banco de dados, sem histórico, sem chat.
- Distribuição por GitHub Releases com **auto-update**, buildado em CI com runner Windows.
- **Fronteira de plataforma explícita**: a captura de áudio do sistema e os atalhos globais ficam atrás de uma interface, com implementação Windows e um stub para desenvolvimento em Linux.

### Non-goals

Chat de texto, comunidades ou servidores, descoberta de usuários, gravação, histórico de mensagens, vídeo de webcam, suporte a macOS ou Linux como plataforma-alvo, moderação.

## Capabilities

### New Capabilities

- `voice-session`: entrar e sair de uma sala, voz sempre ligada, mute, push-to-talk global, indicação de quem está falando e quem está presente.
- `screen-sharing`: selecionar tela ou janela, publicar vídeo com hint de conteúdo apropriado, capturar o áudio do sistema como track separada, assistir à tela de outro participante e controlar o volume dela.
- `room-access`: emissão de token JWT de curta duração que autoriza um participante identificado a entrar numa sala nomeada.
- `desktop-shell`: janela, bandeja do sistema, atalhos globais, isolamento de contexto no Electron, IPC tipado entre main e renderer, e o ciclo de auto-update.

### Modified Capabilities

Nenhuma — o projeto não tem specs anteriores.

## Impact

- Repositório novo, vazio. Sem código legado e sem migração.
- Monorepo com pnpm workspaces e TypeScript: `apps/desktop`, `apps/token-server`, `packages/core`, `packages/shared`, `packages/ui`.
- Dependência externa de terceiro: **LiveKit Cloud** (SFU, TURN e simulcast). Migrar para LiveKit self-hosted depois não muda o código do cliente.
- Desenvolvimento em Linux com validação em uma segunda máquina Windows; a captura de áudio do sistema e o push-to-talk sobre jogo em fullscreen só são verificáveis nessa segunda máquina e com os amigos testadores.
- Executável não assinado: o SmartScreen exibirá aviso na primeira execução de cada release.
