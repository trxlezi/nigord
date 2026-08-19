## 1. Reprodução do áudio remoto

- [x] 1.1 Anexar a faixa quando ela for assinada e desanexar quando terminar,
      excluindo as faixas do próprio participante (design D1, D2)
- [x] 1.2 Replicar isso para quem já estava na sala antes da entrada — o mesmo
      vão que a presença já teve de cobrir
- [x] 1.3 Confirmar que volume por participante e mute local passam a agir sobre
      o que toca, sem código novo além do anexo
- [x] 1.4 Traduzir o estado de reprodução do SDK em evento da porta `RoomClient`
      (design D3)
- [x] 1.5 Apresentar o aviso de áudio bloqueado com a ação para liberá-lo, e
      removê-lo quando a reprodução começar

## 2. Áudio do sistema na captura

- [x] 2.1 Passar `systemAudioConstraints()` para a requisição de captura em vez
      do booleano atual (design D4)
- [x] 2.2 Ler as configurações efetivas da faixa aberta e registrar divergência
      entre o pedido e o que a plataforma entregou
- [ ] 2.3 Medir, com a correção aplicada, se o loopback do Windows honra as três
      restrições e o estéreo; registrar o resultado em `design.md` — precisa de
      som real tocando na máquina, então fica para a sessão de verificação

## 3. Resolução da transmissão

- [x] 3.1 Medir as camadas efetivamente publicadas hoje, com a captura em
      1920×1080, e determinar onde os 960×540 se originam (design D5)
- [x] 3.2 Passar as camadas de `screenShareLayers()` para a publicação, em vez de
      apenas o `maxBitrate` da primeira
- [ ] 3.3 Confirmar que um espectador com área e banda suficientes recebe
      1920×1080, e que reduzir a área reduz a camada — no arcabouço local as
      duas instâncias dividem o mesmo enlace e a camada baixa é a escolha
      correta, então isto só se responde com duas máquinas (anel 3)
- [x] 3.4 Registrar em `design.md` a causa encontrada em 3.1 e os valores que
      ficaram

## 4. Verificação automatizada

- [x] 4.1 Fazer o roteiro de dois participantes verificar que há reprodução ativa
      nos dois lados (design D6)
- [x] 4.2 Acrescentar a medição de resolução recebida com um alvo mínimo, para
      que 540p não passe como aprovação
- [x] 4.3 Confirmar que o roteiro **reprova** com o código anterior à correção —
      um teste que nunca falhou não provou nada. Feito: 10/13 com o adaptador
      anterior, falhando as três verificações novas. Ressalva honesta: a
      verificação de camada falha ali por falta do diagnóstico, não por ler uma
      configuração errada
- [x] 4.4 Rodar `pnpm check` e o roteiro completo

## 5. Correção do que o repositório afirma

- [x] 5.1 Corrigir D11 em `openspec/changes/bootstrap-nigord-desktop/design.md`:
      o que foi validado foi a captura, não o caminho completo
- [x] 5.2 Marcar a tarefa 10.3 do bootstrap com o resultado real — falhou, com a
      causa — em vez de deixá-la em aberto
- [x] 5.3 Ajustar o README, que descreve voz e áudio do sistema como
      funcionando
- [x] 5.4 Corrigir as notas da release 0.4.0 já publicada, que afirmam que o som
      foi visto funcionando
- [x] 5.5 Registrar no `SKILL.md` o ponto cego do roteiro e o que ele passou a
      cobrir

## 6. Distribuição

- [x] 6.1 Publicar uma release nova com as correções — v0.5.0
- [ ] 6.2 Repetir a sessão com o amigo e confirmar os três sintomas originais:
      voz audível, som do jogo audível e separado, imagem nítida
