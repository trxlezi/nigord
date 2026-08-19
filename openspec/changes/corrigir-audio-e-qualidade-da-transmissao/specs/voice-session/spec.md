## ADDED Requirements

### Requirement: Reprodução da voz recebida

O sistema SHALL tornar audível, no dispositivo de saída do participante, a voz
de cada participante remoto cuja track de áudio esteja assinada e não silenciada.

Publicar e assinar uma track não a torna audível: o áudio só sai quando a
aplicação o encaminha para a saída. A ausência deste requisito é o que permitiu
que a sala parecesse funcional — presença correta, indicador de fala correto,
tela chegando — com todos em silêncio.

#### Scenario: Um participante fala

- **WHEN** um participante remoto fala com o microfone ativo
- **THEN** o sistema reproduz a voz dele no dispositivo de saída, e o indicador
  de fala e o som ocorrem juntos

#### Scenario: Participante que já estava na sala

- **WHEN** o participante entra numa sala onde outros já publicavam voz
- **THEN** o sistema reproduz a voz de todos eles, e não apenas a de quem
  chegar depois

#### Scenario: Silenciar localmente

- **WHEN** o espectador silencia um participante apenas para si
- **THEN** o sistema deixa de reproduzir a voz daquele participante para ele, e
  os demais continuam a ouvi-la

#### Scenario: Volume por participante

- **WHEN** o espectador ajusta o volume da voz de um participante
- **THEN** o sistema aplica o ajuste ao que é efetivamente reproduzido, e o
  ajuste permanece válido enquanto aquele participante estiver na sala

### Requirement: Reprodução bloqueada pelo sistema

Quando o sistema operacional ou o navegador recusar iniciar a reprodução de
áudio, o sistema SHALL informar o participante e oferecer uma ação explícita
para liberá-la, em vez de permanecer em silêncio.

Um silêncio sem explicação é indistinguível de um defeito, e foi exatamente
assim que a primeira sessão real terminou sem diagnóstico.

#### Scenario: Reprodução recusada

- **WHEN** a reprodução automática é recusada
- **THEN** o sistema apresenta um aviso visível informando que o áudio está
  bloqueado e oferece uma ação para habilitá-lo

#### Scenario: Participante libera a reprodução

- **WHEN** o participante aciona essa ação
- **THEN** o sistema passa a reproduzir o áudio de todos os participantes
  remotos e remove o aviso

### Requirement: Saída de áudio verificável

O sistema SHALL permitir verificar, sem depender da percepção auditiva de uma
pessoa, que o áudio remoto está sendo reproduzido.

Testes automatizados que observam apenas a imagem aprovaram uma sala muda. A
verificabilidade é um requisito do produto, não um detalhe do arcabouço de
testes.

#### Scenario: Verificação automatizada de sessão

- **WHEN** um roteiro automatizado coloca dois participantes na mesma sala com
  microfones ativos
- **THEN** é possível constatar programaticamente que o áudio remoto está sendo
  reproduzido em cada um dos lados
