# Nigord

Voz e compartilhamento de tela para grupos pequenos. Um aplicativo desktop para jogar com amigos — sem comunidades, sem chat, sem descoberta. Só o que importa: falar e mostrar a tela, com o áudio do jogo junto.

> **Status:** em construção. O token server, o núcleo de sessão, o invólucro Electron e a interface estão implementados e testados. Falta a captura de áudio do sistema no Windows, que depende de validação em hardware real. Progresso em [`tasks.md`](openspec/changes/bootstrap-nigord-desktop/tasks.md).

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

O instalador está em [Releases](../../releases) — baixe o `Nigord-Setup-x.y.z.exe`
mais recente e execute.

**O Windows vai avisar que não reconhece o programa.** O executável não é
assinado, então o SmartScreen mostra "O Windows protegeu o seu PC" na primeira
execução. Para prosseguir: **Mais informações** → **Executar assim mesmo**. Um
certificado de code signing custa centenas de dólares por ano e não se justifica
para um grupo de seis amigos, então esse aviso vai continuar aparecendo em cada
nova versão. Se isso te incomoda, compare o instalador com o publicado na página
de Releases antes de executar — os builds saem do GitHub Actions a partir do
código deste repositório, nunca da máquina de alguém.

A instalação é por usuário, não exige administrador, e você escolhe a pasta. As
atualizações seguintes são automáticas: o aplicativo verifica ao abrir, baixa em
segundo plano e oferece reiniciar. Se a verificação falhar, ele abre normalmente.

Para entrar em uma sala você precisa do **segredo do grupo** — quem cuida do
servidor te passa. Sem ele o aplicativo abre, mas nenhuma sala aceita a entrada.

## Reportar problemas

Abra uma issue em [Issues](../../issues). O que ajuda a resolver rápido:

- **O que aconteceu e o que você esperava.** "O áudio do jogo do Pedro não vem"
  é acionável; "não funciona" não é.
- **A versão**, que aparece na barra da janela, e a versão do Windows.
- **Quantas pessoas estavam na sala** e o que cada uma estava fazendo — quase
  todo problema de mídia depende de quem estava publicando o quê.
- **Se acontece sempre ou foi uma vez.** Uma falha que não repete costuma ser
  rede; uma que repete costuma ser nossa.

Se o problema é que o aviso do SmartScreen apareceu, isso é esperado — veja a
seção acima.

## Desenvolvimento

```bash
pnpm install
pnpm check         # lint + typecheck + testes
pnpm test:watch
pnpm dev:server    # token server (precisa de .env — veja .env.example)
pnpm dev:desktop   # aplicativo Electron, com recarga
```

O `packages/core` roda em qualquer sistema — a lógica de sessão é testada sem
abrir uma janela Electron. Uma regra de lint impede que `core`, `shared` e `ui`
importem Electron ou APIs do Node, que é o que mantém essa propriedade.

## Licença

MIT — veja [LICENSE](LICENSE).
