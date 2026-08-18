# Nigord

Voz e compartilhamento de tela para grupos pequenos. Um aplicativo desktop para jogar com amigos — sem comunidades, sem chat, sem descoberta. Só o que importa: falar e mostrar a tela, com o áudio do jogo junto.

> **Status:** em construção. O token server e o núcleo de sessão estão implementados e testados; o invólucro Electron e a interface ainda não. Progresso em [`tasks.md`](openspec/changes/bootstrap-nigord-desktop/tasks.md).

## Por que existe

As alternativas prontas ou degradam a qualidade da tela nos planos gratuitos, ou trazem um peso de comunidade, servidores e chat que um grupo de seis amigos não usa. O Nigord entrega só o núcleo, com qualidade alta, para um grupo fechado e conhecido.

## O que faz

- **Voz sempre ligada** com cancelamento de eco, mute e push-to-talk global — reconhecido mesmo com o jogo em foco
- **Compartilhamento de tela ou janela** em alta qualidade, com hint de conteúdo para movimento ou texto
- **Áudio do sistema** capturado como track separada da voz, para que cada espectador controle o volume do jogo do amigo independentemente da voz dele
- **Bandeja do sistema** — fechar a janela não derruba a sessão
- **Atualização automática** via GitHub Releases

### Fora de escopo

Chat de texto, comunidades, descoberta de usuários, gravação, histórico, webcam, moderação.

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│  Electron (React + livekit-client)                   │
│    · captura de tela  · áudio do sistema             │
│    · push-to-talk global  · bandeja                  │
└───────────────────────┬──────────────────────────────┘
                        │ WebRTC
                ┌───────▼────────┐
                │  LiveKit Cloud │  SFU + TURN + simulcast
                └───────┬────────┘
                        │ token JWT
              ┌─────────▼──────────┐
              │  token-server      │  Fastify, rota única
              └────────────────────┘
```

**SFU, não mesh.** Com seis participantes, uma topologia P2P exigiria cerca de 25 Mbps de upload sustentado de quem compartilha a tela. Com um SFU, quem compartilha sobe um único fluxo.

**Fronteira de plataforma explícita.** Captura de áudio do sistema e atalhos globais ficam atrás de uma interface, com implementação Windows e um stub honesto para desenvolvimento em Linux — que declara indisponibilidade em vez de simular sucesso.

```
nigord/
├── apps/
│   ├── desktop/
│   │   ├── main/            processo main — Node, acesso ao SO
│   │   │   ├── capture/     ◄── fronteira de plataforma
│   │   │   ├── hotkeys/     ◄── fronteira de plataforma
│   │   │   └── ipc/         contrato tipado main ↔ renderer
│   │   ├── preload/         superfície exposta, mínima e declarada
│   │   └── renderer/        React — agnóstico de SO
│   └── token-server/        Fastify
└── packages/
    ├── core/                lógica de sala e estado, sem Electron
    ├── shared/              tipos e schemas Zod compartilhados
    └── ui/                  componentes
```

Decisões técnicas e alternativas descartadas em [`design.md`](openspec/changes/bootstrap-nigord-desktop/design.md).

## Plataformas

|         | Uso     | Desenvolvimento                           |
| ------- | ------- | ----------------------------------------- |
| Windows | ✅ alvo | ✅                                        |
| Linux   | ❌      | ✅ exceto áudio do sistema e push-to-talk |
| macOS   | ❌      | ❌                                        |

O áudio do sistema depende de captura de loopback, que no Windows o Electron entrega junto do vídeo. No Linux e no macOS o caminho é outro, e o projeto não o persegue.

## Especificação

O projeto usa [OpenSpec](https://github.com/Fission-AI/OpenSpec). O comportamento é definido antes do código:

| Arquivo                                                                | Conteúdo                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`proposal.md`](openspec/changes/bootstrap-nigord-desktop/proposal.md) | Por quê, o que muda, escopo                                       |
| [`specs/`](openspec/changes/bootstrap-nigord-desktop/specs/)           | Contratos de comportamento — voz, tela, acesso, invólucro desktop |
| [`design.md`](openspec/changes/bootstrap-nigord-desktop/design.md)     | Decisões técnicas, riscos, alternativas                           |
| [`tasks.md`](openspec/changes/bootstrap-nigord-desktop/tasks.md)       | Implementação, em ordem de dependência                            |

```bash
openspec status --change bootstrap-nigord-desktop
openspec show bootstrap-nigord-desktop
```

## Instalação

Ainda não há release. Quando houver, o instalador estará em [Releases](../../releases).

O executável não é assinado — o Windows exibirá o aviso do SmartScreen na primeira execução. É "Mais informações" → "Executar assim mesmo". Certificado de code signing custa centenas de dólares por ano e não se justifica para um grupo de amigos.

## Desenvolvimento

```bash
pnpm install
pnpm check        # lint + typecheck + testes
pnpm test:watch
pnpm dev:server   # token server (precisa de .env)
```

O `packages/core` roda em qualquer sistema — a lógica de sessão é testada sem
abrir uma janela Electron. Uma regra de lint impede que `core`, `shared` e `ui`
importem Electron ou APIs do Node, que é o que mantém essa propriedade.

## Licença

MIT — veja [LICENSE](LICENSE).
