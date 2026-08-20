## 1. Modelo de qualidade

- [x] 1.1 Definir em `media.ts` os presets de resolução, taxa de quadros e
      bitrate, com os valores de D2, e remover as camadas de simulcast
- [x] 1.2 Definir as restrições de captura completas — largura, altura e taxa de
      quadros, todas como `ideal`
- [x] 1.3 Cobrir com testes: os presets, e o fato de a captura pedir resolução

## 2. Publicação com codificação única

- [x] 2.1 Publicar a tela sem simulcast, com o bitrate e a taxa de quadros
      escolhidos (design D1)
- [x] 2.2 Levar a qualidade escolhida pela porta `RoomClient` até a publicação
- [x] 2.3 Permitir alterar a qualidade em transmissão, via `applyConstraints` e
      parâmetros do emissor (design D4)

## 3. Interface

- [x] 3.1 Acrescentar os três controles ao seletor de fonte, com os valores
      visíveis
- [x] 3.2 Manter o tipo de conteúdo, com um texto que deixe claro que ele é
      outra coisa (design D3)
- [x] 3.3 Permitir mudar a qualidade enquanto se compartilha, sem reabrir o
      seletor
- [x] 3.4 Persistir a escolha nas preferências

## 4. Verificação

- [x] 4.1 Ajustar o roteiro de dois participantes: uma codificação, coerente com
      o escolhido (design D5)
- [x] 4.2 Confirmar por medição que o espectador recebe a resolução escolhida
      quando a banda permite
- [x] 4.3 `pnpm check` e o roteiro completo
- [x] 4.4 Registrar em `design.md` os valores medidos

## 5. Distribuição

- [x] 5.1 Publicar a release — v0.6.0
- [ ] 5.2 Confirmar com o amigo que a imagem melhorou, e medir o consumo contra
      a franquia do plano gratuito (bootstrap 10.6)
