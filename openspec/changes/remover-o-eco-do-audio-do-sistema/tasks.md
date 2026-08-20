## 1. Barramento de referência

- [x] 1.1 Criar o grafo de áudio: cada elemento reproduzido é ligado a um
      barramento de mistura que segue para a saída (design D2)
- [x] 1.2 Confirmar que volume por participante e mute local continuam agindo
- [x] 1.3 Retomar o `AudioContext` junto com a ação de destravar o áudio

## 2. Subtração

- [x] 2.1 Escrever o worklet que subtrai a referência atrasada da captura
      (design D5)
- [x] 2.2 Estimar o atraso por correlação ao iniciar o compartilhamento
      (design D3)
- [x] 2.3 Reavaliar periodicamente e desligar a subtração quando ela não estiver
      reduzindo energia (design D3, D4)
- [x] 2.4 Publicar a faixa tratada no lugar da capturada

## 3. Verificação

- [ ] 3.1 Medir, com o app rodando, que um tom tocado pelo próprio app não
      aparece na faixa publicada — **não verificável nesta bancada** (design
      D7): as duas instâncias dividem a placa de som
- [ ] 3.2 Medir que um som de outro processo continua na faixa publicada —
      idem, fica para a sessão real
- [x] 3.3 Fazer o roteiro de dois participantes reprovar o retorno do próprio
      áudio
- [x] 3.4 `pnpm check` e o roteiro completo
- [x] 3.5 Registrar os valores medidos em `design.md`

## 4. Problemas conhecidos

- [x] 4.1 Registrar no README que o ponteiro do mouse aparece na transmissão e
      por quê, com os links das issues do Electron

## 5. Distribuição

- [ ] 5.1 Publicar a release
- [ ] 5.2 Confirmar em sessão real: ninguém escuta a própria voz, e o som do
      jogo continua audível
