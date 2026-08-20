import type { PlaybackBus } from './playbackBus.js';

/**
 * Devolve a faixa de áudio do sistema sem o que o próprio aplicativo tocou.
 *
 * O caminho é digital: o que o barramento manda para a placa de som volta pelo
 * loopback idêntico, apenas atrasado — medido nesta máquina em 282 ms, ganho
 * 1,000, e 83,9 dB de cancelamento por subtração simples (design D1).
 *
 * E subtrair, no Web Audio, não exige processar amostra por amostra:
 *
 *     captura ──────────────────────────┐
 *                                       ├──▶ faixa publicada
 *     referência ──▶ atraso ──▶ ×(−1) ──┘
 *
 * Duas fontes ligadas ao mesmo nó somam; invertendo uma delas, somar é
 * subtrair. O trabalho acontece no código nativo do navegador, sem
 * AudioWorklet — que, medido, nem chega a carregar no aplicativo empacotado
 * (design D5).
 *
 * A postura em caso de dúvida vale mais que o recurso: enquanto não há
 * alinhamento confiável, a subtração fica desligada e o que se publica é o
 * áudio como veio. Eco é irritante; o som do jogo cancelado por engano é o
 * projeto quebrado.
 */

/** Acima desta fração de energia restante, a subtração não está valendo. */
const REDUCAO_MINIMA = 0.9;

/** Intervalo entre tentativas de alinhamento e verificações posteriores. */
const CICLO_MS = 4_000;

export interface CleanResult {
  /** A faixa a publicar. É sempre a tratada quando o grafo pôde ser montado. */
  track: MediaStreamTrack;
  /** Preenchido quando o alinhamento já foi encontrado. */
  delayMs: number | null;
  /** Preenchido quando não há tratamento nenhum a fazer. */
  reason: string | null;
  stop: () => void;
}

const semTratamento = (track: MediaStreamTrack, reason: string): CleanResult => ({
  track,
  delayMs: null,
  reason,
  stop: () => undefined,
});

export async function cleanSystemAudio(
  bus: PlaybackBus,
  track: MediaStreamTrack,
): Promise<CleanResult> {
  const referencia = bus.referenceNode();
  // Nada foi reproduzido ainda: não há eco possível, e montar o grafo só
  // acrescentaria peças ao caminho do áudio sem nada a remover.
  if (!referencia) return semTratamento(track, 'sem áudio remoto para subtrair');

  const { context, node } = referencia;
  if (context.state !== 'running') return semTratamento(track, 'áudio do aplicativo suspenso');

  const entrada = context.createMediaStreamSource(new MediaStream([track]));
  const atraso = context.createDelay(2);
  const inversor = context.createGain();
  // Começa desligado: o alinhamento ainda não existe, e subtrair um sinal
  // desalinhado é somar ruído ao áudio que a sala inteira escuta.
  inversor.gain.value = 0;

  const soma = context.createGain();
  const destino = context.createMediaStreamDestination();
  entrada.connect(soma);
  node.connect(atraso).connect(inversor).connect(soma);
  soma.connect(destino);

  const medidorEntrada = context.createAnalyser();
  const medidorSaida = context.createAnalyser();
  medidorEntrada.fftSize = 2048;
  medidorSaida.fftSize = 2048;
  entrada.connect(medidorEntrada);
  soma.connect(medidorSaida);

  const limpa = destino.stream.getAudioTracks()[0];
  if (!limpa) {
    entrada.disconnect();
    node.disconnect(atraso);
    return semTratamento(track, 'o destino não produziu faixa');
  }

  const estado = { atrasoMs: null as number | null, ativa: false };

  /**
   * O alinhamento depende de haver som na referência, e a referência são as
   * vozes da sala — que existem quando alguém fala. Uma tentativa única no
   * início falha sempre que o compartilhamento começa em silêncio, que foi
   * exatamente o observado. Daí insistir: assim que alguém falar, alinha.
   */
  const ciclo = async (): Promise<void> => {
    if (estado.ativa) {
      const dentro = energiaDe(medidorEntrada);
      const fora = energiaDe(medidorSaida);
      // Trocar o dispositivo de saída no meio da sessão desfaz o alinhamento.
      if (dentro > 1e-8 && fora > dentro * REDUCAO_MINIMA) {
        estado.ativa = false;
        estado.atrasoMs = null;
        inversor.gain.value = 0;
        console.warn('nigord: subtração de eco desligada — o alinhamento se perdeu');
      }
      return;
    }

    const segundos = await estimateDelay(context, node, track);
    if (segundos === null) return;
    atraso.delayTime.value = segundos;
    inversor.gain.value = -1;
    estado.ativa = true;
    estado.atrasoMs = Math.round(segundos * 1000 * 10) / 10;
    console.info('nigord: eco removido, atraso de', estado.atrasoMs, 'ms');
  };

  void ciclo();
  const timer = setInterval(() => void ciclo(), CICLO_MS);

  return {
    track: limpa,
    get delayMs() {
      return estado.atrasoMs;
    },
    reason: null,
    stop: () => {
      clearInterval(timer);
      entrada.disconnect();
      node.disconnect(atraso);
      atraso.disconnect();
      inversor.disconnect();
      soma.disconnect();
    },
  };
}

function energiaDe(analisador: AnalyserNode): number {
  const bloco = new Float32Array(analisador.fftSize);
  analisador.getFloatTimeDomainData(bloco);
  let total = 0;
  for (const amostra of bloco) total += amostra * amostra;
  return total / bloco.length;
}

/**
 * Encontra, por correlação cruzada, quanto tempo separa o que tocamos do que
 * capturamos. Devolve segundos, ou null quando não há pico claro.
 *
 * 282 ms nesta máquina; noutra placa, outro valor — por isso é medido e não
 * assumido (design D3).
 *
 * Os dois sinais entram pelo MESMO nó de processamento, um por canal. É o que
 * garante que estejam na mesma linha do tempo: a primeira tentativa lia os dois
 * de analisadores em intervalos, e amostras lidas assim não são contíguas — a
 * correlação não achava pico nenhum, e foi o console que denunciou isso antes
 * de qualquer suposição.
 *
 * O processamento em JavaScript existe só aqui, durante a medição. Depois dela
 * o grafo faz a subtração sozinho, sem nada por amostra.
 */
async function estimateDelay(
  context: AudioContext,
  referencia: GainNode,
  captura: MediaStreamTrack,
): Promise<number | null> {
  const JANELA = Math.floor(context.sampleRate * 0.4);
  const MAX_ATRASO = Math.floor(context.sampleRate * 0.6);
  const TOTAL = JANELA + MAX_ATRASO;

  const origemCaptura = context.createMediaStreamSource(new MediaStream([captura]));
  const juntador = context.createChannelMerger(2);
  origemCaptura.connect(juntador, 0, 0);
  referencia.connect(juntador, 0, 1);

  const coletor = context.createScriptProcessor(4096, 2, 1);
  const mudo = context.createGain();
  mudo.gain.value = 0;
  juntador.connect(coletor);
  coletor.connect(mudo).connect(context.destination);

  const cap = new Float32Array(TOTAL);
  const ref = new Float32Array(TOTAL);
  let escrito = 0;

  try {
    await new Promise<void>((resolve) => {
      coletor.onaudioprocess = (evento) => {
        if (escrito >= TOTAL) return resolve();
        const canalCap = evento.inputBuffer.getChannelData(0);
        const canalRef = evento.inputBuffer.getChannelData(1);
        const quanto = Math.min(canalCap.length, TOTAL - escrito);
        cap.set(canalCap.subarray(0, quanto), escrito);
        ref.set(canalRef.subarray(0, quanto), escrito);
        escrito += quanto;
        if (escrito >= TOTAL) resolve();
      };
    });
  } finally {
    coletor.onaudioprocess = null;
    origemCaptura.disconnect();
    referencia.disconnect(juntador);
    juntador.disconnect();
    coletor.disconnect();
    mudo.disconnect();
  }

  let energiaRef = 0;
  for (let i = 0; i < JANELA; i++) energiaRef += ref[i]! * ref[i]!;
  // Referência em silêncio: ninguém falou nesta janela. Não é falha, é a
  // próxima tentativa.
  if (energiaRef / JANELA < 1e-8) return null;

  let melhorAtraso = -1;
  let melhorCorrelacao = 0;
  for (let atraso = 0; atraso < MAX_ATRASO; atraso += 1) {
    let total = 0;
    for (let i = 0; i < JANELA; i += 8) total += (cap[atraso + i] ?? 0) * ref[i]!;
    if (total > melhorCorrelacao) {
      melhorCorrelacao = total;
      melhorAtraso = atraso;
    }
  }
  if (melhorAtraso < 0) return null;

  // A correlação sozinha não basta: um sinal periódico — um tom, uma nota
  // sustentada — correlaciona igualmente bem em vários atrasos, e a escolha
  // vira sorteio. Medido: a mesma cena estimando 0,3 ms numa tentativa e 595 ms
  // na seguinte.
  //
  // Então o candidato tem de provar que cancela, nos mesmos dados já coletados.
  // É o único critério que não depende da forma do sinal.
  let energiaCaptura = 0;
  let energiaResidual = 0;
  for (let i = 0; i < JANELA; i++) {
    const capturado = cap[melhorAtraso + i] ?? 0;
    const residuo = capturado - ref[i]!;
    energiaCaptura += capturado * capturado;
    energiaResidual += residuo * residuo;
  }

  const REDUCAO_EXIGIDA = 0.5;
  if (energiaCaptura < 1e-8 || energiaResidual > energiaCaptura * REDUCAO_EXIGIDA) return null;

  return melhorAtraso / context.sampleRate;
}
