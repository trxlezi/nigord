# Design — bootstrap-nigord-desktop

## Context

Ver `proposal.md` — Why. Requisitos em `specs/`.

Três restrições moldam todas as decisões abaixo:

1. **6 participantes simultâneos.** O compartilhamento de tela é o gargalo de banda, não a voz.
2. **Alvo Windows, desenvolvimento em Linux.** A máquina de desenvolvimento principal não consegue exercitar o áudio do sistema nem o push-to-talk sobre jogos.
3. **Grupo fechado de amigos.** Não há requisito de escala, cadastro, moderação ou multi-tenancy — e o tempo do time é o recurso mais escasso.

## Goals / Non-Goals

**Goals:**

- Manter o código de plataforma isolado atrás de uma fronteira única, para que a maior parte do desenvolvimento aconteça no Linux sem condicionais espalhadas.
- Manter a lógica de sessão testável sem abrir uma janela Electron.
- Comprar infraestrutura de mídia pronta em vez de operá-la.
- Deixar o ciclo build → release → amigos testando com atrito próximo de zero.

**Non-Goals:**

- Operar SFU próprio nesta fase.
- Suporte a Linux ou macOS como plataforma-alvo (o Linux é ambiente de desenvolvimento, não de uso).
- Assinatura de código.
- Testes end-to-end automatizados da mídia — a validação de mídia é manual, com os anéis de teste descritos abaixo.

## Decisions

### D1 — SFU gerenciado (LiveKit Cloud) em vez de mesh P2P

Com 6 participantes e uma tela 1080p a ~5 Mbps, o mesh exigiria ~25 Mbps de upload sustentado de quem compartilha, com o jogo rodando junto. Inviável em banda residencial brasileira. Com SFU, quem compartilha sobe um único fluxo.

Alternativas consideradas:

- **Mesh puro.** Descartado pela aritmética de upload acima. Seria viável para 3-4 pessoas apenas com voz.
- **mediasoup self-hosted.** Controle total e sem custo de terceiro, mas transfere para o time a operação de servidor de mídia, TURN e escalonamento — trabalho que não avança o produto. Objetivo declarado é a ferramenta funcionando.
- **LiveKit self-hosted.** Adiado. A API do cliente é a mesma, então migrar depois não toca o código do renderer — só a URL e a emissão de token.

O LiveKit Cloud também entrega TURN, simulcast e reconexão automática, que seriam três frentes de trabalho separadas. TURN não é opcional: uma fração relevante das conexões não fecha diretamente por NAT/CGNAT, comum em operadoras brasileiras.

### D2 — Fronteira de plataforma explícita

Toda capacidade específica de sistema operacional — captura de áudio do sistema, enumeração de fontes de tela, atalhos globais — fica atrás de uma interface no processo main, com duas implementações: a real para Windows e um stub para desenvolvimento em Linux. A resolução acontece em um único ponto, na inicialização.

Isso permite rodar a aplicação inteira no Linux — entrar em sala, falar, ver a interface — com o stub declarando as capacidades indisponíveis. As specs já preveem esse caso (`screen-sharing`: "Captura de áudio do sistema indisponível").

Alternativa considerada: condicionais `process.platform` no ponto de uso. Descartada — espalha conhecimento de plataforma pelo código e torna impossível saber, ao ler, o que funciona onde.

### D3 — Áudio do sistema como track separada, sem processamento de voz

Duas razões, ambas decisivas:

- O cancelamento de eco e a supressão de ruído assumem que o sinal é fala e tratam música e efeitos sonoros como ruído a eliminar. Misturar o áudio do jogo na track de voz o destrói.
- Tracks separadas dão a cada espectador controle de volume independente entre o jogo do amigo e a voz do amigo — requisito explícito em `screen-sharing`.

O custo é uma track a mais por participante que compartilha. Irrelevante nessa escala.

### D4 — Monorepo com pnpm workspaces

```
nigord/
├── apps/
│   ├── desktop/
│   │   ├── main/            processo main — Node, acesso ao SO
│   │   │   ├── capture/     ◄── fronteira de plataforma (D2)
│   │   │   ├── hotkeys/     ◄── fronteira de plataforma (D2)
│   │   │   ├── updater/
│   │   │   └── ipc/         contrato tipado main ↔ renderer (D5)
│   │   ├── preload/         superfície exposta, mínima e declarada
│   │   └── renderer/        React — agnóstico de SO
│   └── token-server/        Fastify, rota única
└── packages/
    ├── core/                lógica de sala e estado, sem Electron
    ├── shared/              tipos e schemas Zod compartilhados
    └── ui/                  componentes
```

`packages/core` não depende de Electron nem de DOM. Isso é o que permite testar a máquina de estados da sessão com Vitest em milissegundos, no Linux, sem abrir janela. `packages/shared` carrega os schemas Zod usados nas duas pontas do IPC e no contrato com o token-server — uma definição, validada em runtime nas fronteiras.

Alternativa considerada: pasta única sem workspaces. Mais simples no dia um, mas nada impediria o renderer de importar Electron, e a fronteira de D2 se dissolveria em semanas.

### D5 — IPC tipado com isolamento de contexto

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. O preload expõe uma superfície pequena e nomeada — não o `ipcRenderer` cru. Cada canal tem seu payload validado por schema Zod compartilhado, nos dois sentidos.

Retrofitar isolamento depois é refatoração dolorosa; adotá-lo desde o primeiro commit não custa quase nada.

### D6 — Token server mínimo, sem banco de dados

Uma rota que recebe sala, identidade e o segredo compartilhado do grupo, e devolve um JWT de curta duração assinado com a chave da API do LiveKit. Sem persistência, sem usuários, sem sessões — a identidade é o apelido que o participante escolhe, e o controle de acesso é o segredo compartilhado (D1 do ponto de vista de segurança: o grupo é fechado e conhecido).

A chave de API nunca sai do servidor — é por isso que o token server existe, em vez de o cliente assinar o próprio token.

### D7 — Build em CI com runner Windows

O executável não é compilado na máquina Linux. GitHub Actions em `windows-latest` produz o instalador, publica em Releases, e o `electron-updater` consome dali. Compilar Windows a partir do Linux com Wine é possível, mas frágil com módulos nativos.

Auto-update não é conforto: com seis testadores, versões divergentes tornam qualquer relato de bug ambíguo.

### D8 — Anéis de validação

```
Linux (diário)      → UI, salas, voz, core.       Ciclo de segundos.
Windows (2ª máquina)→ áudio do sistema, PTT,      Ciclo de minutos.
                      build real.
Amigos (releases)   → NAT real, jogos reais,      Ciclo de dias.
                      6 pessoas simultâneas.
```

Cada anel é mais lento e mais verdadeiro. O terceiro é o único que revela congestionamento com seis uploads e jogos rodando — e por isso D7 importa.

### D9 — Capturador de tela do Windows: WGC com escape hatch

**Observado em uma máquina** (Windows 11, Intel com duas saídas de vídeo, Electron 33.4.11): compartilhar a tela produz `wgc_capture_session.cc ProcessFrame failed, using existing frame: -2147467259` (`E_FAIL`) de forma contínua, a cada ~200–280 ms. O Windows Graphics Capture não derruba a sessão — reaproveita o último quadro bom — então o compartilhamento sobrevive enquanto envelhece, e quem assiste vê a imagem travar.

Desligar o WGC pelas features do Chromium (`AllowWgcScreenCapturer`, `AllowWgcWindowCapturer`, `AllowWgcDesktopCapturer`) faz o Chromium cair no capturador DXGI antigo e elimina as mensagens por completo.

**Por que é uma variável de ambiente (`NIGORD_DISABLE_WGC=1`) e não o padrão:** o DXGI tem fraquezas próprias, e há evidência de uma máquina só. Trocar o padrão agora seria substituir um problema conhecido por um desconhecido em seis máquinas diferentes. A decisão pede o anel 3.

**Em aberto, e é o que decide:** se o loopback de áudio do Electron depende do WGC. O raciocínio diz que não — o loopback é WASAPI, independente do capturador de vídeo — mas isso não foi medido. Se depender, existe um trade-off real entre qualidade de vídeo e som do jogo, e o som do jogo é a razão de ser do projeto.

### D10 — Chat efêmero pelo canal de dados, sem histórico

O chat de texto estava fora de escopo, e a decisão aparecia no código como `canPublishData: false` no grant do token. A exclusão misturava duas coisas de custo muito diferente.

**Mensagens em tempo real são essencialmente gratuitas.** Elas trafegam pelo canal de dados da conexão WebRTC que já existe para a voz: nenhum servidor novo, nenhuma rota nova, nenhuma mensagem passando pelo token server. O volume de texto ao lado de vídeo de tela é irrelevante para a franquia do plano gratuito.

**Histórico é o que custa.** Persistir mensagens exige banco de dados e transforma o token server, hoje uma rota sem estado que assina JWTs, num serviço com estado, backup e migração — exatamente o peso que motivou a exclusão original.

Então o escopo se divide onde o custo se divide: o chat existe enquanto a sala existe e sai com ela. Sem histórico, sem notificações, sem quem-leu-o-quê. A sessão mantém as últimas 200 linhas em memória para que uma noite inteira aberta não cresça sem limite.

O envelope é versionado (`nigord.chat.v1`) e tipos desconhecidos são ignorados em vez de recusados, para que um cliente antigo continue utilizável quando um mais novo passar a enviar algo que ele nunca viu.

### D11 — Resultado do spike de viabilidade (tarefa 1.4)

Validado em 19/08/2026, na máquina Windows do autor (Windows 10 Pro 19045),
contra um projeto real do LiveKit Cloud.

| Premissa                             | Resultado                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Áudio do sistema junto da tela (1.1) | ✅ a faixa de loopback é aberta e carrega sinal                                    |
| Faixa separada da voz (1.2)          | ✅ é publicada como fonte própria, com nível independente no mixer                 |
| Atalho global com jogo em foco (1.3) | ✅ o push-to-talk é recebido                                                       |

**O que este spike NÃO validou, e o texto anterior dava a entender que sim.**
Tudo acima foi observado no lado de quem **envia** — o mixer do Windows, a
publicação, o indicador de nível. Nada aqui tocou o lado de quem **recebe**.

A primeira sessão real, no mesmo dia, mostrou o que faltava: ninguém escutava
ninguém. Duas causas, ambas medidas depois:

1. **Áudio remoto nunca era reproduzido.** O `livekit-client` assina a faixa e
   só toca o que a aplicação anexa a um elemento; nada anexava. A sala inteira
   ficava muda, com presença, indicador de fala e vídeo funcionando — que é o
   que tornou o defeito tão difícil de atribuir.
2. **A captura de loopback vinha com os filtros de voz ligados.**
   `systemAudioConstraints()` existia, estava documentada e nunca era chamada,
   então o áudio do sistema chegava com cancelamento de eco, supressão de ruído
   e AGC — em mono. O cancelamento de eco é o mais grave: seu sinal de
   referência é a própria saída que está sendo capturada.

A premissa central — o loopback do Windows pelo Electron — continua de pé. O
erro foi de método, não de arquitetura: um spike que mede só a origem prova
metade do caminho e parece provar o todo.

**Multi-participante no Windows.** O `two-participants.mjs` passou a rodar
também no Windows — sem `xvfb`, sobre a área de trabalho real, com o processo
encerrado por `taskkill /T` já que não há grupo de processos para sinalizar.

Os dez cenários passaram, e passaram numa sala muda: o roteiro media
`videoWidth > 0` e nada de áudio. Também registrou "960×540 no receptor" como
sinal de sucesso, quando a captura era 1920×1080 — metade da resolução, anotada
sem que ninguém percebesse. Ambos os pontos cegos são tratados na mudança
`corrigir-audio-e-qualidade-da-transmissao`.

## Risks / Trade-offs

- **A captura de áudio de loopback no Windows via Electron não se comporta como esperado** → Esta é a premissa técnica central de todo o projeto. Validar com um spike isolado na máquina Windows *antes* de qualquer trabalho de interface. Se falhar, a abordagem inteira precisa ser revista, e é melhor saber na primeira semana.
- **Push-to-talk global não chega ao aplicativo com jogos em fullscreen exclusivo** → Alguns jogos capturam a entrada antes do sistema. Testar cedo com os jogos que o grupo realmente joga. Mitigação parcial: modo alternativo de voz sempre ligada com mute por atalho, que já é o comportamento padrão.
- **Dependência de terceiro (LiveKit Cloud): limites do plano gratuito, mudança de preço, indisponibilidade** → Manter o acoplamento restrito a `packages/core` e à emissão de token, de modo que migrar para self-hosted seja uma troca de endereço, não uma reescrita.
- **Custo de banda excede o plano gratuito com uso intenso** → Monitorar o consumo nas primeiras semanas de uso real e limitar a resolução/bitrate máximos de compartilhamento se necessário.
- **Aviso do SmartScreen a cada release** → Assumido conscientemente. Documentar no README o procedimento para os amigos, para que ninguém interprete como malware.
- **A maior parte do desenvolvimento acontece onde as features centrais não rodam** → D2 torna isso sustentável, mas há um risco residual de o stub divergir do comportamento real. Manter o stub deliberadamente honesto: ele declara indisponibilidade, nunca simula sucesso.

## Migration Plan

Projeto novo, sem migração. Ordem de implantação: token server em produção antes do primeiro build distribuído, já que o cliente não funciona sem ele. Rollback de uma release ruim: republicar a release anterior no GitHub Releases; o `electron-updater` a distribui como atualização.

## Open Questions

- Onde hospedar o token server (Fly.io, Railway, VPS existente). Não afeta specs, arquitetura nem tarefas — é uma escolha de implantação, decidível quando o serviço estiver pronto.
- Bitrate e resolução máximos padrão para compartilhamento. Só é possível calibrar com os seis conectados de verdade, no anel 3.
